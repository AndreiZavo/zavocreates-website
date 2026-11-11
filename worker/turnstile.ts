const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Server-side Turnstile check. Any network or parse error counts as a failed check. */
export async function verifyTurnstile(token: string, ip: string | null, secret: string): Promise<boolean> {
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ip ? { secret, response: token, remoteip: ip } : { secret, response: token }),
    });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}
