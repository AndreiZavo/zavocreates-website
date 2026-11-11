import { EmailError, sendEmail } from "./email";
import { triage } from "./triage";
import { isTestSecret, verifyTurnstile } from "./turnstile";
import { validate } from "./validate";

export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  TURNSTILE_SECRET: string;
  RESEND_API_KEY: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
}

const CONTACT_PATH = "/api/contact";
const MAX_BODY_BYTES = 20 * 1024;
/** The `action` the form's Turnstile widget is rendered with (src/scripts/contact-form.ts). */
const TURNSTILE_ACTION = "contact";
/** Hosts where Cloudflare's dummy Turnstile secrets are allowed (local `npm run preview`). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Mode = "json" | "form";

/** Reads at most `limit` bytes; null when the body is larger (whatever Content-Length said). */
async function readLimited(req: Request, limit: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function reply(mode: Mode, status: number, error?: string): Response {
  if (mode === "form") {
    // No-JS fallback (Ruling R2): the page shows the matching message with CSS :target.
    return new Response(null, {
      status: 303,
      headers: { location: status === 200 ? "/#contact-sent" : "/#contact-error" },
    });
  }
  return Response.json(error === undefined ? { ok: true } : { ok: false, error }, { status });
}

function parseBody(mode: Mode, raw: string): unknown {
  if (mode === "json") return JSON.parse(raw);
  const form = new URLSearchParams(raw);
  const pick = (key: string) => form.get(key) ?? undefined;
  return {
    name: pick("name"),
    email: pick("email"),
    service: pick("service"),
    message: pick("message"),
    // The Turnstile widget adds this hidden field to the form it renders in.
    turnstileToken: pick("cf-turnstile-response") ?? pick("turnstileToken"),
  };
}

async function handleContact(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }

  const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  const mode: Mode | null =
    type === "application/json" ? "json" : type === "application/x-www-form-urlencoded" ? "form" : null;
  if (!mode) return Response.json({ ok: false, error: "Unsupported content type" }, { status: 415 });

  // Configuration problems: log the variable or problem name only, never a value.
  for (const name of ["TURNSTILE_SECRET", "RESEND_API_KEY"] as const) {
    if (!env[name]) {
      console.error(`contact: missing secret ${name}`);
      return reply(mode, 503, "Service unavailable");
    }
  }
  const hostname = new URL(req.url).hostname;
  if (isTestSecret(env.TURNSTILE_SECRET) && !LOCAL_HOSTS.has(hostname)) {
    console.error("contact: TURNSTILE_SECRET is a Cloudflare test secret on a non-local host");
    return reply(mode, 503, "Service unavailable");
  }

  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return reply(mode, 413, "Message is too large");
    const raw = await readLimited(req, MAX_BODY_BYTES);
    if (raw === null) return reply(mode, 413, "Message is too large");

    let body: unknown;
    try {
      body = parseBody(mode, raw);
    } catch {
      return reply(mode, 400, "Invalid request");
    }

    const checked = validate(body);
    if (!checked.ok) return reply(mode, 400, checked.error);
    const contact = checked.data;

    const human = await verifyTurnstile(contact.turnstileToken, req.headers.get("cf-connecting-ip"), env.TURNSTILE_SECRET, {
      action: TURNSTILE_ACTION,
      hostname,
    });
    if (!human) return reply(mode, 403, "Spam check failed");

    // Never throws: the email goes out untriaged if the AI fails.
    const result = await triage(env.AI, contact);

    try {
      await sendEmail(env, contact, result);
    } catch (err) {
      console.error(`contact: email failed: ${err instanceof EmailError ? err.message : "unknown error"}`);
      return reply(mode, 502, "Could not send your message");
    }
    return reply(mode, 200);
  } catch (err) {
    // Log the error kind only: never the body or the visitor's address.
    console.error(`contact: unexpected ${err instanceof Error ? err.name : "error"}`);
    return reply(mode, 500, "Something went wrong");
  }
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === CONTACT_PATH) return handleContact(req, env);
    return env.ASSETS.fetch(req);
  },
};
