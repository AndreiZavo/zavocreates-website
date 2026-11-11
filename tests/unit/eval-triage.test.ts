/**
 * Offline checks for the triage eval harness (evals/triage/run.ts): the cases file, the scoring
 * and the report, using a fake Ai and a fake fetch. No network.
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCases,
  main,
  median,
  percentile,
  renderSection,
  renderTable,
  restAi,
  runModel,
  score,
  type EvalCase,
} from "../../evals/triage/run.ts";
import { TriageSchema } from "../../worker/triage.ts";
import { ContactSchema, SERVICE_OPTIONS } from "../../worker/validate.ts";

const cases = loadCases();
const JSON_MODE = "JSON Mode couldn't be met";

beforeEach(() => {
  // triage() logs each failed attempt; keep test output quiet.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Finds which case a triage() call is about from the user message it sends. */
function caseOf(input: unknown): EvalCase {
  const content = (input as { messages: { content: string }[] }).messages[1]?.content ?? "";
  const data = JSON.parse(content.split("\n")[1] ?? "{}") as { message: string };
  const c = cases.find((x) => x.contact.message === data.message);
  if (!c) throw new Error("fake Ai: unknown case");
  return c;
}

const answer = (c: EvalCase, over: Record<string, unknown> = {}) => ({
  ...c.expected,
  budget_hint: null,
  summary: "Summary.",
  suggested_reply: "Thanks, I'll be in touch.",
  ...over,
});

type Behaviour = (c: EvalCase, call: number) => unknown;
function fakeAi(behaviour: Behaviour): Ai {
  const calls = new Map<string, number>();
  return {
    run: async (_model: string, input: unknown) => {
      const c = caseOf(input);
      const n = (calls.get(c.id) ?? 0) + 1;
      calls.set(c.id, n);
      return behaviour(c, n);
    },
  } as unknown as Ai;
}

describe("cases.json", () => {
  it("has 20 cases split 8 en / 8 ro / 4 spam-off-topic with unique ids", () => {
    expect(cases).toHaveLength(20);
    const n = (g: string) => cases.filter((c) => c.group === g).length;
    expect([n("en"), n("ro"), n("spam")]).toEqual([8, 8, 4]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(20);
  });

  it("covers every category and urgency the schema allows", () => {
    const seen = (f: "category" | "urgency") => new Set(cases.map((c) => c.expected[f]));
    expect([...seen("category")].sort()).toEqual([...TriageSchema.shape.category.options].sort());
    expect([...seen("urgency")].sort()).toEqual([...TriageSchema.shape.urgency.options].sort());
  });

  it("labels the en and ro groups with their language and writes Romanian with diacritics", () => {
    for (const c of cases.filter((x) => x.group !== "spam")) expect(c.expected.language).toBe(c.group);
    for (const c of cases.filter((x) => x.group === "ro")) expect(c.contact.message).toMatch(/[ăâîșț]/);
  });

  it("uses real service options, example domains, and passes the Worker's ContactSchema", () => {
    for (const c of cases) {
      expect(SERVICE_OPTIONS).toContain(c.contact.service);
      expect(c.contact.email).toMatch(/@example\.(com|ro)$/);
      expect(ContactSchema.safeParse({ ...c.contact, turnstileToken: "t" }).success).toBe(true);
    }
  });

  it("includes a prompt-injection attempt labelled as an honest classifier would", () => {
    const inj = cases.find((c) => /ignore previous instructions/i.test(c.contact.message));
    expect(inj?.expected).toEqual({ category: "spam", language: "en", urgency: "low" });
  });
});

describe("scoring", () => {
  it("scores a perfect model 100% and passes the selection rule", async () => {
    const results = await runModel(fakeAi((c) => ({ response: answer(c) })), "m", cases);
    const r = score("m", cases, results);
    expect(r.correct).toEqual({ category: 20, language: 20, urgency: 20 });
    expect([r.schemaValid, r.retries, r.jsonModeErrors, r.passes]).toEqual([20, 0, 0, true]);
    expect(r.misses).toEqual([]);
  });

  it("counts wrong labels, invalid output, JSON-mode errors and retries", async () => {
    const ai = fakeAi((c, call) => {
      switch (c.id) {
        case "en-01":
          return { response: answer(c, { category: "filming" }) };
        case "en-02":
          return { response: answer(c, { urgency: "low" }) };
        case "ro-03":
          return { response: answer(c, { language: "other" }) };
        case "ro-01": // chat-completions shape, JSON as a string
          return { choices: [{ message: { content: JSON.stringify(answer(c)) } }] };
        case "spam-01": // bad JSON first, fine on the retry
          return call === 1 ? { response: "not json" } : { response: answer(c) };
        case "spam-02": // JSON mode fails on both attempts
          throw new Error(`Workers AI REST 400: ${JSON_MODE}`);
        case "ro-05": // schema-invalid both times
          return { response: answer(c, { category: "video" }) };
        default:
          return { response: answer(c) };
      }
    });
    const r = score("m", cases, await runModel(ai, "m", cases));
    expect(r.schemaValid).toBe(18);
    expect(r.correct).toEqual({ category: 17, language: 17, urgency: 17 });
    expect(r.retries).toBe(3);
    expect(r.jsonModeErrors).toBe(2);
    expect(r.otherErrors).toBe(0);
    expect(r.passes).toBe(false); // 85% category, 90% schema-valid
    expect(r.misses).toEqual([
      "en-01: category scripting→filming",
      "en-02: urgency high→low",
      "ro-03: language ro→other",
      "ro-05: no valid output",
      "spam-02: no valid output",
    ]);
  });

  it("passes at exactly 90% category accuracy and fails below 100% schema-valid", () => {
    const ok = (id: string, category = cases.find((c) => c.id === id)!.expected.category) => ({
      id,
      output: answer(cases.find((c) => c.id === id)!, { category }) as never,
      latencyMs: 1,
      calls: 1,
      errors: [],
    });
    const two = cases.slice(0, 2).map((c) => c.id);
    const results = cases.map((c) => (two.includes(c.id) ? ok(c.id, "other") : ok(c.id)));
    expect(score("m", cases, results).passes).toBe(true); // 18/20 = 90%
    const oneNull = results.map((r, i) => (i === 19 ? { ...r, output: null } : r));
    expect(score("m", cases, oneNull).passes).toBe(false);
  });

  it("computes median and nearest-rank p95 latency", () => {
    const values = Array.from({ length: 20 }, (_, i) => 20 - i); // 20..1, unsorted
    expect(median(values)).toBe(10.5);
    expect(percentile(values, 95)).toBe(19);
    expect(median([3, 1, 2])).toBe(2);
    expect(percentile([], 95)).toBe(0);
  });

  it("measures latency per case with retries included", async () => {
    let t = 0;
    const clock = () => (t += 5);
    const ai = fakeAi((c, call) => (c.id === "en-03" && call === 1 ? { response: "x" } : { response: answer(c) }));
    const results = await runModel(ai, "m", cases.slice(0, 3), clock);
    expect(results.map((r) => [r.id, r.calls, r.latencyMs])).toEqual([
      ["en-01", 1, 5],
      ["en-02", 1, 5],
      ["en-03", 2, 5],
    ]);
  });
});

describe("report", () => {
  it("renders a markdown table row per model and a dated section", async () => {
    const r = score("@cf/x/model", cases, await runModel(fakeAi((c) => ({ response: answer(c) })), "@cf/x/model", cases));
    const table = renderTable([r]).split("\n");
    expect(table[0]).toBe(
      "| Model | Category | Language | Urgency | Schema-valid | Median ms | p95 ms | Retries | JSON-mode errors | Other errors | Meets rule |",
    );
    expect(table[2]).toMatch(/^\| `@cf\/x\/model` \| 20\/20 \(100%\) \| 20\/20 \(100%\) \| 20\/20 \(100%\) \| 20\/20 \(100%\) \| \d+ \| \d+ \| 0 \| 0 \| 0 \| yes \|$/);
    const section = renderSection([r], cases, new Date("2026-11-11T09:30:00Z"));
    expect(section).toContain("## Run 2026-11-11 09:30 UTC");
    expect(section).toContain("20 cases (8 en, 8 ro, 4 spam/off-topic)");
    expect(section).toContain("- `@cf/x/model`: none");
  });
});

describe("REST adapter", () => {
  it("posts to the account's ai/run endpoint with a bearer token and unwraps result", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ result: { response: { a: 1 } }, success: true, errors: [], messages: [] }),
    }));
    const out = await (restAi("acc123", "tok-secret", fetch).run as unknown as (m: string, i: unknown) => Promise<unknown>)(
      "@cf/ibm-granite/granite-4.0-h-micro",
      { messages: [] },
    );
    expect(out).toEqual({ response: { a: 1 } });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/ibm-granite/granite-4.0-h-micro",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-secret" }),
        body: JSON.stringify({ messages: [] }),
      }),
    );
  });

  it("throws the API error (without the token), which triage() turns into an invalid result", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ result: null, success: false, errors: [{ code: 5000, message: JSON_MODE }], messages: [] }),
    }));
    const ai = restAi("acc123", "tok-secret", fetch);
    const run = ai.run as unknown as (m: string, i: unknown) => Promise<unknown>;
    const err = await run("m", {}).catch((e: Error) => e);
    expect(String(err)).toContain(JSON_MODE);
    expect(String(err)).not.toContain("tok-secret");

    const results = await runModel(ai, "m", cases.slice(0, 1));
    expect(results[0]).toMatchObject({ output: null, calls: 2 });
    const r = score("m", cases.slice(0, 1), results);
    expect([r.schemaValid, r.jsonModeErrors, r.retries]).toEqual([0, 2, 1]);
  });
});

describe("main", () => {
  const io = () => ({ log: vi.fn(), error: vi.fn(), fetch: vi.fn(), resultsPath: join(tmpdir(), `eval-${Date.now()}.md`) });

  it("exits 2 with a clear message and no network call when env vars are missing", async () => {
    const o = io();
    expect(await main(["--model", "x"], {}, o)).toBe(2);
    expect(o.error.mock.calls[0]?.[0]).toMatch(/missing environment variable\(s\): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN/);
    expect(o.fetch).not.toHaveBeenCalled();
    expect(existsSync(o.resultsPath)).toBe(false);
  });

  it("exits 2 without --model", async () => {
    const o = io();
    expect(await main([], { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" }, o)).toBe(2);
    expect(o.error.mock.calls[0]?.[0]).toMatch(/--model/);
    expect(o.fetch).not.toHaveBeenCalled();
  });
});
