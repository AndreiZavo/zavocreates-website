interface ImportMetaEnv {
  /** Cloudflare Turnstile sitekey for the contact form (build time). Unset: Cloudflare's test key. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
