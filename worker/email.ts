/**
 * Sends the enquiry to Andrei through Resend, as two emails in one Gmail conversation:
 *
 * 1. "Private notes" (only when the AI triage succeeded): category, summary, language, urgency,
 *    budget, suggested reply. Reply-To is Andrei himself, so an accidental reply never reaches the
 *    visitor.
 * 2. The visitor's message: name, email, service, message. Reply-To is the visitor. It is sent last
 *    and references the notes' Message-ID, so it threads under them and is the newest message:
 *    Gmail's Reply answers it and quotes only what the visitor wrote, never the notes.
 *
 * The visitor's message is the one that matters: a failed notes email or Message-ID lookup is
 * logged and the message still goes out (unthreaded). Visitor and AI text only ever appear as plain
 * text or escaped HTML; recipients and sender come from config, reply_to is the validated visitor
 * email. The subject carries no triage, because the visitor sees it in "Re:".
 */
import type { Env } from "./index";
import type { Triage } from "./triage";
import type { Contact } from "./validate";

const RESEND_URL = "https://api.resend.com/emails";
/** Resend's per-second rate limit can answer 429 to the third quick call; one retry, waiting at most this long. */
const MAX_RETRY_WAIT_MS = 2000;

export class EmailError extends Error {
  override name = "EmailError";
}

type Section = [label: string, body: string];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, no control characters (no CR/LF header injection), bounded length. No triage in it. */
export function subjectLine(c: Contact): string {
  const raw = `${c.service} enquiry – ${c.name}`;
  const line = raw.replace(/[\u0000-\u001f\u007f\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  return Array.from(line).slice(0, 200).join(""); // by code point, so no split emoji
}

export const NOTES_INTRO =
  "Private notes, only for you. The client's message is the next email in this conversation: reply to that one.";

export function notesSections(t: Triage): Section[] {
  return [
    ["Category", t.category],
    ["Summary", t.summary],
    ["Language / urgency", `${t.language} / ${t.urgency}`],
    ["Budget", t.budget_hint ?? "not mentioned"],
    ["Suggested reply", t.suggested_reply],
  ];
}

export function messageSections(c: Contact): Section[] {
  return [
    ["From", `${c.name} <${c.email}>`],
    ["Service", c.service],
    ["Message", c.message],
  ];
}

export function renderText(sections: Section[], intro?: string): string {
  const body = sections.map(([label, text]) => `${label}:\n${text}`).join("\n\n");
  return intro ? `${intro}\n\n${body}` : body;
}

export function renderHtml(sections: Section[], intro?: string): string {
  const lead = intro ? `<p style="margin:0 0 8px;color:#666">${escapeHtml(intro)}</p>` : "";
  const blocks = sections
    .map(
      ([label, text]) =>
        `<h3 style="margin:16px 0 4px">${escapeHtml(label)}</h3><p style="margin:0;white-space:pre-wrap">${escapeHtml(text)}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:sans-serif">${lead}${blocks}</body></html>`;
}

/** A Message-ID as Resend reports it, safe to put in a header. */
const MESSAGE_ID = /^<[^\s<>]+>$/;

async function resend(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const request = (): Promise<Response> =>
    fetch(`${RESEND_URL}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    });
  let res: Response;
  try {
    res = await request();
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? "1") * 1000 || 0, MAX_RETRY_WAIT_MS);
      await new Promise((resolve) => setTimeout(resolve, wait));
      res = await request();
    }
  } catch {
    throw new EmailError("Resend unreachable");
  }
  if (!res.ok) throw new EmailError(`Resend responded ${res.status}`);
  return res;
}

async function send(env: Env, payload: Record<string, unknown>): Promise<string> {
  const res = await resend(env, "", { method: "POST", body: JSON.stringify(payload) });
  const { id } = (await res.json()) as { id?: unknown };
  if (typeof id !== "string") throw new EmailError("Resend returned no id");
  return id;
}

async function messageIdOf(env: Env, id: string): Promise<string | undefined> {
  const res = await resend(env, `/${encodeURIComponent(id)}`);
  const { message_id: messageId } = (await res.json()) as { message_id?: unknown };
  return typeof messageId === "string" && MESSAGE_ID.test(messageId) ? messageId : undefined;
}

export async function sendEmail(env: Env, c: Contact, t: Triage | null): Promise<void> {
  const subject = subjectLine(c);
  let thread: string | undefined;
  if (t) {
    try {
      const notes = notesSections(t);
      const id = await send(env, {
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: env.CONTACT_TO,
        subject,
        text: renderText(notes, NOTES_INTRO),
        html: renderHtml(notes, NOTES_INTRO),
      });
      thread = await messageIdOf(env, id);
    } catch (err) {
      // The visitor's message still goes out, just without the notes thread.
      console.error(`contact: notes email: ${err instanceof EmailError ? err.message : "unknown error"}`);
    }
  }
  const message = messageSections(c);
  await send(env, {
    from: env.CONTACT_FROM,
    to: [env.CONTACT_TO],
    reply_to: c.email,
    subject,
    text: renderText(message),
    html: renderHtml(message),
    ...(thread ? { headers: { "In-Reply-To": thread, References: thread } } : {}),
  });
}
