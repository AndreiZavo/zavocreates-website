const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare's documented dummy secret keys (always pass, always fail, "token already spent"):
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 * Their siteverify success response is a fixed dummy: `"hostname": "example.com"` and no `action`
 * field (the example response on that page), so the hostname/action check below cannot hold for
 * them. With a test secret the check is skipped, and worker/index.ts refuses test secrets outright
 * on any host other than a local one, so a production deploy can't run with the spam check off.
 */
export const TEST_SECRETS: ReadonlySet<string> = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const isTestSecret = (secret: string): boolean => TEST_SECRETS.has(secret);

/** What the token must have been issued for: the widget's `action` and the page's hostname. */
export interface Expected {
  action: string;
  hostname: string;
}

/**
 * Server-side Turnstile check. Besides `success`, it checks the token's `action` and `hostname`
 * ("Validate the action and hostname when specified":
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), so a token from
 * another site or another widget using the same sitekey is refused. Any network or parse error
 * counts as a failed check.
 */
export async function verifyTurnstile(token: string, ip: string | null, secret: string, expected: Expected): Promise<boolean> {
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ip ? { secret, response: token, remoteip: ip } : { secret, response: token }),
    });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null) return false;
    const { success, action, hostname } = data as { success?: unknown; action?: unknown; hostname?: unknown };
    if (success !== true) return false;
    if (isTestSecret(secret)) return true;
    return action === expected.action && hostname === expected.hostname;
  } catch {
    return false;
  }
}
