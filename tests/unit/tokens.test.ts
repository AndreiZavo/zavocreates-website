import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorName, readTokens, renderTokensCss, tokensCssPath } from "../../scripts/gen-tokens";

describe("tokens.css", () => {
  const css = renderTokensCss(readTokens());

  it("is up to date with content/tokens.json (run `npm run gen:tokens`)", () => {
    expect(readFileSync(tokensCssPath, "utf8")).toBe(css);
  });

  it("names every colour, text style, space and radius", () => {
    for (const name of ["--color-purple-green", "--text-heading-1-size", "--text-heading-1-line", "--text-heading-1-tracking", "--text-heading-1-weight", "--text-heading-1-family", "--space-20", "--radius-16"]) {
      expect(css).toContain(`${name}:`);
    }
  });

  it("gives id-suffixed colours a readable name and rejects unmapped ones", () => {
    expect(css).not.toMatch(/--color-[a-z0-9-]+-(c930|fc1f):/);
    expect(colorName("grey-100-c930", "c93060b7-10b4-4b33-9f93-19045f574f53")).toBe("grey-100-fixed");
    expect(() => colorName("red-63c1", "63c1aa9b-b60d-46e8-b1c7-6d9c05a923bd")).toThrow();
  });

  it("overrides text sizes per breakpoint and colours in dark mode", () => {
    const tokens = readTokens();
    for (const bp of tokens.breakpoints.filter((b) => b.name !== "desktop")) expect(css).toContain(`@media ${bp.media}`);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });
});
