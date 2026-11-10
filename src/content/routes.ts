/** The pages that exist, in sitemap order, and the language alternates of the pricing page. */
export const PAGE_PATHS = ["/", "/pricing", "/pricing-ro"] as const;
export type PagePath = (typeof PAGE_PATHS)[number];

export type Alternate = { lang: string; path: string };

export const PRICING_ALTERNATES: Alternate[] = [
  { lang: "en", path: "/pricing" },
  { lang: "ro", path: "/pricing-ro" },
  { lang: "x-default", path: "/pricing" },
];
