interface ImportMetaEnv {
  /** Cloudflare Turnstile sitekey for the contact form (build time). Unset: Cloudflare's test key. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Cloudflare Web Analytics site token (build time, public). Unset: no analytics beacon. */
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
