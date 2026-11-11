/**
 * Sends the enquiry to Andrei through Resend. Visitor and AI text only ever appear as plain
 * text or escaped HTML; recipients and sender come from config, reply_to is the validated
 * visitor email.
 */
import type { Env } from "./index";
import type { Triage } from "./triage";
import type { Contact } from "./validate";

const RESEND_URL = "https://api.resend.com/emails";

export class EmailError extends Error {
  override name = "EmailError";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, no control characters (no CR/LF header injection), bounded length. */
export function subjectLine(c: Contact, t: Triage | null): string {
  const raw = `[${t?.category ?? "untriaged"}] ${c.name} – ${c.service}`;
  const line = raw.replace(/[\u0000-\u001f\u007f\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  return Array.from(line).slice(0, 200).join(""); // by code point, so no split emoji
}

function sections(c: Contact, t: Triage | null): [string, string][] {
  const triage: [string, string][] = t
    ? [
        ["Summary", t.summary],
        ["Language / urgency", `${t.language} / ${t.urgency}`],
        ["Budget", t.budget_hint ?? "not mentioned"],
        ["Suggested reply", t.suggested_reply],
      ]
    : [["Triage", "Triage unavailable"]];
  return [...triage, ["From", `${c.name} <${c.email}>`], ["Service", c.service], ["Message", c.message]];
}

export function renderText(c: Contact, t: Triage | null): string {
  return sections(c, t)
    .map(([label, body]) => `${label}:\n${body}`)
    .join("\n\n");
}

export function renderHtml(c: Contact, t: Triage | null): string {
  const blocks = sections(c, t)
    .map(
      ([label, body]) =>
        `<h3 style="margin:16px 0 4px">${escapeHtml(label)}</h3><p style="margin:0;white-space:pre-wrap">${escapeHtml(body)}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:sans-serif">${blocks}</body></html>`;
}

export async function sendEmail(env: Env, c: Contact, t: Triage | null): Promise<void> {
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: c.email,
        subject: subjectLine(c, t),
        text: renderText(c, t),
        html: renderHtml(c, t),
      }),
    });
  } catch {
    throw new EmailError("Resend unreachable");
  }
  if (!res.ok) throw new EmailError(`Resend responded ${res.status}`);
}
