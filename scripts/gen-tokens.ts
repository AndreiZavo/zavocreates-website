/**
 * Generates src/styles/tokens.css from content/tokens.json.
 *
 *   node --experimental-strip-types scripts/gen-tokens.ts
 *
 * Runs before `astro build` and `astro dev` (see package.json). The output is committed;
 * tests/unit/tokens.test.ts fails when it is out of date.
 *
 * Reads tokens.json directly (not getTokens()) so it runs under plain `node` with no
 * bundler; only erasable TypeScript syntax is used so Node 22 can strip the types.
 * tests/unit/content.test.ts validates tokens.json against the schema.
 *
 * Custom properties:
 *   --color-<name>                                   light value, dark value under prefers-color-scheme
 *   --text-<style>-size|line|tracking|weight|family  plus -paragraph, -transform, -color
 *   --link-<name>-color|decoration|hover-color|hover-decoration
 *   --space-<n>                                      n = pixel value, every length used in a gap or padding
 *   --radius-<n>                                     n = pixel value; a percentage p is named <p>pct
 *   --shadow-<name>
 * Text sizes are written for the desktop breakpoint; tablet and phone override what differs
 * inside the media queries from tokens.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Tokens } from "../src/content/schema.ts";

const TOKENS_JSON = new URL("../content/tokens.json", import.meta.url);
const TOKENS_CSS = new URL("../src/styles/tokens.css", import.meta.url);

/**
 * Framer has two pairs of colour styles with the same name. The extraction kept the first
 * of each pair under the plain name and suffixed the second with the first four characters
 * of its Framer id. Those keys get a readable name here; the Framer id says which is which.
 */
const COLOR_RENAMES: Record<string, string> = {
  // "Grey 100" c93060b7…: rgb(207, 207, 207) in both themes (grey-100 changes with the theme)
  "grey-100-c930": "grey-100-fixed",
  // "Green" fc1f0b1d…: rgb(243, 255, 226), the pale tint next to purple / pink / blue (green is the saturated one)
  "green-fc1f": "green-tint",
};

const FALLBACK_FAMILY: Record<Tokens["fonts"][number]["family"], string> = {
  Antonio: "sans-serif",
  Inter: "sans-serif",
};

type Declarations = [property: string, value: string][];

export function colorName(key: string, framerId: string): string {
  const renamed = COLOR_RENAMES[key];
  if (renamed) return renamed;
  if (key.endsWith(`-${framerId.slice(0, 4)}`)) {
    throw new Error(`Colour "${key}" has an id-suffixed name. Add a readable name to COLOR_RENAMES.`);
  }
  return key;
}

function textDeclarations(name: string, style: Tokens["text"][string], bp: "desktop" | "tablet" | "phone"): Declarations {
  const m = style.breakpoints[bp];
  return [
    [`--text-${name}-size`, m.fontSize],
    [`--text-${name}-line`, m.lineHeight],
    [`--text-${name}-tracking`, m.letterSpacing],
    [`--text-${name}-paragraph`, m.paragraphSpacing],
  ];
}

/** Every single length in a list of gaps / paddings / radii, e.g. "12px 20px 12px 20px" gives 12px and 20px. */
function lengths(values: string[]): string[] {
  const all = values.flatMap((v) => v.split(" "));
  const unique = [...new Set(all)];
  for (const v of unique) {
    if (!/^[\d.]+(px|%)$/.test(v)) throw new Error(`Unsupported length "${v}" (expected px or %).`);
  }
  return unique.sort((a, b) => Number(a.endsWith("%")) - Number(b.endsWith("%")) || parseFloat(a) - parseFloat(b));
}

const lengthName = (v: string): string => v.replace(/px$/, "").replace(/%$/, "pct").replace(".", "_");

function rule(selector: string, decls: Declarations, indent = ""): string {
  const body = decls.map(([p, v]) => `${indent}  ${p}: ${v};`).join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

const media = (query: string, decls: Declarations): string => `@media ${query} {\n${rule(":root", decls, "  ")}\n}`;

export function renderTokensCss(tokens: Tokens): string {
  const base: Declarations = [["color-scheme", tokens.colorScheme]];
  const dark: Declarations = [];
  const seen = new Set<string>();

  for (const [key, c] of Object.entries(tokens.colors)) {
    const name = colorName(key, c.framerId);
    if (seen.has(name)) throw new Error(`Two colours map to --color-${name}.`);
    seen.add(name);
    base.push([`--color-${name}`, c.light]);
    if (c.dark !== c.light) dark.push([`--color-${name}`, c.dark]);
  }

  const desktop = tokens.breakpoints.find((b) => b.name === "desktop");
  if (!desktop) throw new Error("tokens.json has no desktop breakpoint.");
  const overrides = tokens.breakpoints.filter((b) => b !== desktop).map((b) => ({ bp: b, decls: [] as Declarations }));

  for (const [name, style] of Object.entries(tokens.text)) {
    const desktopDecls = textDeclarations(name, style, "desktop");
    base.push(
      ...desktopDecls,
      [`--text-${name}-weight`, String(style.fontWeight)],
      [`--text-${name}-family`, `"${style.fontFamily}", ${FALLBACK_FAMILY[style.fontFamily]}`],
      [`--text-${name}-transform`, style.textTransform],
      [`--text-${name}-color`, style.color],
    );
    for (const o of overrides) {
      const decls = textDeclarations(name, style, o.bp.name);
      o.decls.push(...decls.filter(([, v], i) => v !== desktopDecls[i]?.[1]));
    }
  }

  for (const [name, l] of Object.entries(tokens.link)) {
    base.push(
      [`--link-${name}-color`, l.color],
      [`--link-${name}-decoration`, l.decoration],
      [`--link-${name}-hover-color`, l.hoverColor],
      [`--link-${name}-hover-decoration`, l.hoverDecoration],
    );
  }

  for (const v of lengths([...tokens.space.gaps, ...tokens.space.paddings])) base.push([`--space-${lengthName(v)}`, v]);
  for (const v of lengths(tokens.radii)) base.push([`--radius-${lengthName(v)}`, v]);
  for (const [name, v] of Object.entries(tokens.shadows)) base.push([`--shadow-${name}`, v]);

  return [
    "/* Generated by scripts/gen-tokens.ts from content/tokens.json. Do not edit. */",
    rule(":root", base),
    ...(dark.length ? [media("(prefers-color-scheme: dark)", dark)] : []),
    ...overrides.filter((o) => o.decls.length).map((o) => media(o.bp.media, o.decls)),
    "",
  ].join("\n\n").replace(/\n\n$/, "\n");
}

export const readTokens = (): Tokens => JSON.parse(readFileSync(TOKENS_JSON, "utf8")) as Tokens;
export const tokensCssPath = fileURLToPath(TOKENS_CSS);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TOKENS_CSS, renderTokensCss(readTokens()));
  console.log(`gen-tokens: wrote ${tokensCssPath}`);
}
