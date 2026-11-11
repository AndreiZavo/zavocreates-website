/// <reference types="node" />
/**
 * Triage model eval: runs every case in cases.json through the Worker's own triage() against
 * Workers AI over its REST API, scores the labels and appends a dated table to results.md.
 *
 *   export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...
 *   npm run eval:triage -- --model @cf/ibm-granite/granite-4.0-h-micro --model <another id>
 *
 * Not run in CI (needs a Cloudflare account). tests/unit/eval-triage.test.ts covers the scoring
 * and reporting with a fake Ai, offline.
 *
 * Runs under `node --experimental-strip-types` like scripts/*.ts: only erasable TypeScript,
 * relative imports carry the .ts extension. worker/triage.ts is importable this way because its
 * only runtime import is zod (validate.ts is a type-only import and is erased). validate.ts itself
 * is not imported here: it imports content/home.json without an import attribute, which plain
 * Node refuses; the unit test checks the cases against ContactSchema instead.
 *
 * Workers AI REST API (https://developers.cloudflare.com/workers-ai/get-started/rest-api/,
 * checked 2026-11-11):
 *   POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
 *   Authorization: Bearer {API_TOKEN}, body = the same input object env.AI.run() takes.
 *   Response envelope: { "result": { ...what the binding returns... }, "success": true,
 *   "errors": [], "messages": [] }; on failure success is false and errors[] holds
 *   { code, message }. The adapter returns `result` so triage() sees the binding's shape, and
 *   throws on failure, as the binding does. JSON Mode
 *   (https://developers.cloudflare.com/workers-ai/features/json-mode/) can fail with
 *   "JSON Mode couldn't be met"; that surfaces here as a thrown error, which triage() catches,
 *   retries once and then returns null: counted as schema-invalid.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SYSTEM_PROMPT, TriageSchema, triage, type Triage } from "../../worker/triage.ts";
import type { Contact } from "../../worker/validate.ts";

export const CASES_PATH = fileURLToPath(new URL("./cases.json", import.meta.url));
export const RESULTS_PATH = fileURLToPath(new URL("./results.md", import.meta.url));

/** Selection rule from the Task 10 brief. */
export const MIN_CATEGORY_ACCURACY = 0.9;
export const REQUIRED_SCHEMA_VALID = 1;

const FIELDS = ["category", "language", "urgency"] as const;
type Field = (typeof FIELDS)[number];
export type Expected = Pick<Triage, Field>;

export interface EvalCase {
  id: string;
  group: "en" | "ro" | "spam";
  contact: Pick<Contact, "name" | "email" | "service" | "message">;
  expected: Expected;
}

export interface CaseResult {
  id: string;
  output: Triage | null;
  latencyMs: number;
  /** Calls triage() made to the model: 1 normally, 2 when it retried. */
  calls: number;
  /** Error messages the model call threw (one per failed call). */
  errors: string[];
}

export interface ModelReport {
  model: string;
  total: number;
  correct: Record<Field, number>;
  schemaValid: number;
  medianMs: number;
  p95Ms: number;
  retries: number;
  jsonModeErrors: number;
  otherErrors: number;
  misses: string[];
  passes: boolean;
}

/** Reads and checks cases.json (labels must be values the triage schema allows). */
export function loadCases(path: string = CASES_PATH): EvalCase[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${path}: expected an array of cases`);
  return raw.map((c: EvalCase, i) => {
    if (!c || typeof c.id !== "string" || !c.contact || !c.expected) throw new Error(`${path}: case ${i} is malformed`);
    TriageSchema.pick({ category: true, language: true, urgency: true }).parse(c.expected);
    return c;
  });
}

/** Rejects any message matching JSON Mode's documented failure. */
export const isJsonModeError = (message: string): boolean => /JSON Mode couldn'?t be met/i.test(message);

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; statusText: string; json(): Promise<unknown> }>;

interface Envelope {
  result?: unknown;
  success?: boolean;
  errors?: { code?: number; message?: string }[];
}

/** An `Ai`-compatible object whose run() calls the Workers AI REST API and unwraps `result`. */
export function restAi(accountId: string, token: string, fetchImpl: FetchLike = fetch): Ai {
  const run = async (model: string, input: unknown): Promise<unknown> => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    let body: Envelope | undefined;
    try {
      body = (await res.json()) as Envelope;
    } catch {
      body = undefined;
    }
    if (!res.ok || body?.success !== true) {
      const detail = (body?.errors ?? []).map((e) => e.message ?? `code ${e.code}`).join("; ");
      throw new Error(`Workers AI REST ${res.status}: ${detail || res.statusText || "no error details"}`);
    }
    return body.result;
  };
  return { run } as unknown as Ai;
}

/** Runs every case through triage() for one model, sequentially (latency is per case, retries included). */
export async function runModel(
  ai: Ai,
  model: string,
  cases: EvalCase[],
  now: () => number = () => performance.now(),
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    let calls = 0;
    const errors: string[] = [];
    const counting = {
      run: async (m: string, input: unknown) => {
        calls++;
        try {
          return await (ai.run as unknown as (m: string, i: unknown) => Promise<unknown>)(m, input);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
          throw err;
        }
      },
    } as unknown as Ai;
    const start = now();
    // The cases carry no Turnstile token: triage() never reads it.
    const output = await triage(counting, { ...c.contact, turnstileToken: "eval" }, model);
    results.push({ id: c.id, output, latencyMs: now() - start, calls, errors });
  }
  return results;
}

/** Nearest-rank percentile (p in 0..100); 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? 0;
}

/** Median: mean of the two middle values for an even count. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function score(model: string, cases: EvalCase[], results: CaseResult[]): ModelReport {
  const byId = new Map(results.map((r) => [r.id, r]));
  const correct: Record<Field, number> = { category: 0, language: 0, urgency: 0 };
  const misses: string[] = [];
  let schemaValid = 0;
  for (const c of cases) {
    const r = byId.get(c.id);
    // null (triage gave up) or anything the schema rejects counts as invalid and wrong on every field.
    const valid = r?.output != null && TriageSchema.safeParse(r.output).success;
    if (!valid || !r?.output) {
      misses.push(`${c.id}: no valid output`);
      continue;
    }
    schemaValid++;
    const wrong: string[] = [];
    for (const f of FIELDS) {
      if (r.output[f] === c.expected[f]) correct[f]++;
      else wrong.push(`${f} ${c.expected[f]}→${r.output[f]}`);
    }
    if (wrong.length) misses.push(`${c.id}: ${wrong.join(", ")}`);
  }
  const latencies = results.map((r) => r.latencyMs);
  const errors = results.flatMap((r) => r.errors);
  const jsonModeErrors = errors.filter(isJsonModeError).length;
  const total = cases.length;
  return {
    model,
    total,
    correct,
    schemaValid,
    medianMs: median(latencies),
    p95Ms: percentile(latencies, 95),
    retries: results.reduce((n, r) => n + Math.max(0, r.calls - 1), 0),
    jsonModeErrors,
    otherErrors: errors.length - jsonModeErrors,
    misses,
    passes: total > 0 && correct.category / total >= MIN_CATEGORY_ACCURACY && schemaValid / total >= REQUIRED_SCHEMA_VALID,
  };
}

const pct = (n: number, total: number) => `${n}/${total} (${total ? Math.round((n / total) * 100) : 0}%)`;

export function renderTable(reports: ModelReport[]): string {
  const head = [
    "Model",
    "Category",
    "Language",
    "Urgency",
    "Schema-valid",
    "Median ms",
    "p95 ms",
    "Retries",
    "JSON-mode errors",
    "Other errors",
    "Meets rule",
  ];
  const rows = reports.map((r) => [
    `\`${r.model}\``,
    pct(r.correct.category, r.total),
    pct(r.correct.language, r.total),
    pct(r.correct.urgency, r.total),
    pct(r.schemaValid, r.total),
    String(Math.round(r.medianMs)),
    String(Math.round(r.p95Ms)),
    String(r.retries),
    String(r.jsonModeErrors),
    String(r.otherErrors),
    r.passes ? "yes" : "no",
  ]);
  return [head, head.map(() => "---"), ...rows].map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

export const promptHash = (): string => createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);

export function renderSection(reports: ModelReport[], cases: EvalCase[], date: Date): string {
  const count = (g: EvalCase["group"]) => cases.filter((c) => c.group === g).length;
  const lines = [
    `## Run ${date.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `${cases.length} cases (${count("en")} en, ${count("ro")} ro, ${count("spam")} spam/off-topic); ` +
      `SYSTEM_PROMPT sha256 \`${promptHash()}\`; triage() settings (temperature 0, up to 2 attempts per case).`,
    "",
    renderTable(reports),
    "",
    "Misses:",
    "",
    ...reports.map((r) => `- \`${r.model}\`: ${r.misses.length ? r.misses.join("; ") : "none"}`),
    "",
  ];
  return lines.join("\n");
}

export function parseArgs(argv: string[]): { models: string[] } | { error: string } {
  const models: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--model") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) return { error: "--model needs a model id" };
      models.push(v);
    } else if (a.startsWith("--model=")) {
      models.push(a.slice("--model=".length));
    } else {
      return { error: `unknown argument: ${a}` };
    }
  }
  if (models.length === 0) return { error: "give at least one --model <id>" };
  return { models };
}

const USAGE = "usage: npm run eval:triage -- --model <id> [--model <id> ...]";

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  io: { log: (s: string) => void; error: (s: string) => void; fetch?: FetchLike; resultsPath?: string } = {
    log: console.log,
    error: console.error,
  },
): Promise<number> {
  const args = parseArgs(argv);
  if ("error" in args) {
    io.error(`eval:triage: ${args.error}\n${USAGE}`);
    return 2;
  }
  const accountId = env["CLOUDFLARE_ACCOUNT_ID"];
  const token = env["CLOUDFLARE_API_TOKEN"];
  const missing = [!accountId && "CLOUDFLARE_ACCOUNT_ID", !token && "CLOUDFLARE_API_TOKEN"].filter(Boolean);
  if (!accountId || !token) {
    io.error(
      `eval:triage: missing environment variable(s): ${missing.join(", ")}.\n` +
        "Set them to your Cloudflare account ID and a Workers AI API token " +
        "(https://developers.cloudflare.com/workers-ai/get-started/rest-api/). Nothing was sent.",
    );
    return 2;
  }
  const cases = loadCases();
  const ai = restAi(accountId, token, io.fetch);
  const reports: ModelReport[] = [];
  for (const model of args.models) {
    io.log(`eval:triage: ${model} (${cases.length} cases)...`);
    reports.push(score(model, cases, await runModel(ai, model, cases)));
  }
  io.log(`\n${renderTable(reports)}\n`);
  for (const r of reports) io.log(`${r.model} misses: ${r.misses.length ? r.misses.join("; ") : "none"}`);
  const resultsPath = io.resultsPath ?? RESULTS_PATH;
  appendFileSync(resultsPath, `\n${renderSection(reports, cases, new Date())}`);
  io.log(`\nAppended to ${resultsPath}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
