/** The pages that exist, in sitemap order, and the language alternates of the pricing and privacy pages. */
export const PAGE_PATHS = ["/", "/pricing", "/pricing-ro", "/privacy", "/privacy-ro"] as const;
export type PagePath = (typeof PAGE_PATHS)[number];

export type Alternate = { lang: string; path: string };

export const PRICING_ALTERNATES: Alternate[] = [
  { lang: "en", path: "/pricing" },
  { lang: "ro", path: "/pricing-ro" },
  { lang: "x-default", path: "/pricing" },
];

export const PRIVACY_ALTERNATES: Alternate[] = [
  { lang: "en", path: "/privacy" },
  { lang: "ro", path: "/privacy-ro" },
  { lang: "x-default", path: "/privacy" },
];
