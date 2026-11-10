import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HomeContent,
  Layout,
  Motion,
  PricingContent,
  Site,
  Tokens,
} from "../../src/content/schema";
import { getHome, getMotion, getPricing, getSite, getTokens } from "../../src/content/load";

const root = join(__dirname, "..", "..");
const contentDir = join(root, "content");
const read = (f: string): unknown => JSON.parse(readFileSync(join(contentDir, f), "utf8"));

const schemaFor: Record<string, { parse: (v: unknown) => unknown }> = {
  "site.json": Site,
  "home.json": HomeContent,
  "pricing.en.json": PricingContent,
  "pricing.ro.json": PricingContent,
  "tokens.json": Tokens,
  "motion.json": Motion,
  "layout.json": Layout,
};

function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

describe("content files", () => {
  const files = readdirSync(contentDir).filter((f) => f.endsWith(".json"));

  it("has a schema for every content/*.json file", () => {
    expect(files.sort()).toEqual(Object.keys(schemaFor).sort());
  });

  it.each(Object.keys(schemaFor))("%s parses against its schema", (f) => {
    expect(() => schemaFor[f]!.parse(read(f))).not.toThrow();
  });

  it("contains no hidden Framer text or template defaults", () => {
    const strings = files.flatMap((f) => allStrings(read(f)));
    for (const banned of ["Interaction design and micro-animations", "Brand strategy", "UI/UX design", "+1 (555)"]) {
      expect(strings.filter((s) => s.includes(banned))).toEqual([]);
    }
  });

  it("references only images, icons and Lottie files that exist in public/", () => {
    const refs = files
      .flatMap((f) => allStrings(read(f)))
      .filter((s) => /^\/(images|icons|lottie)\//.test(s));
    expect(refs.length).toBeGreaterThan(20);
    for (const r of new Set(refs)) expect(existsSync(join(root, "public", r)), r).toBe(true);
  });
});

describe("home content (values read from Framer)", () => {
  const home = getHome();

  it("shows the three visible Post-Production bullets", () => {
    expect(home.services[3]!.bullets).toEqual([
      "Craft a smooth, story-driven edit",
      "Enhance with color, sound, and motion",
      "Deliver polished content, platform-ready",
    ]);
  });

  it("has the real counter targets and suffixes", () => {
    expect(home.about.counters.map((c) => `${c.value}${c.suffix} ${c.label}`)).toEqual([
      "5 Years of Experience",
      "100+ Completed Projects",
      "20+ Clients on Worldwide",
    ]);
  });

  it("has the contact form copy from Framer", () => {
    expect(home.contact.serviceOptions).toEqual([
      "Scripting",
      "Filming",
      "Video Editing",
      "Video Production",
      "All of the above",
    ]);
    expect(home.contact.success).toBe("Thank you");
    expect(home.contact.error).toBe("Something went wrong");
  });

  it("orders six projects on desktop and three on phone", () => {
    expect(home.projects).toHaveLength(6);
    expect(home.projectOrder.phone).toEqual(["life", "demmers", "blitz"]);
  });
});

describe("pricing content", () => {
  it("has the four package prices as Framer has them", () => {
    // The task brief listed "450 RON" for Test; Framer and the live site both say 500 RON.
    expect(getPricing("en").packages.map((p) => p.price)).toEqual([
      "500 RON",
      "1400 RON",
      "2400 RON",
      "3300 RON",
    ]);
  });

  it("keeps Calendly query strings exactly", () => {
    expect(getPricing("en").packages[2]!.href).toBe(
      "https://calendly.com/zavocreates/discovery-call?a1=Growth%20-%208%20videos%20subscription",
    );
  });

  it("uses the copy a desktop visitor sees when an item is open (Framer 'Desktop / Open - N')", () => {
    // Desktop / Closed carries a collapsed, invisible older value for these lines.
    expect(getPricing("ro").faq[2]!.lines[0]).toBe("Nu chiar. Voi veniți cu povestea voastră");
    expect(getPricing("en").faq[1]!.lines[0]).toBe("One, two or three shoot days per month depending on your package");
  });

  it("has the Romanian FAQ", () => {
    const ro = getPricing("ro");
    expect(ro.lang).toBe("ro");
    expect(ro.faq[3]!.lines[2]).toBe("Construim ceva împreună");
  });
});

describe("site, tokens and motion", () => {
  it("has the site contact details", () => {
    const site = getSite();
    expect(site.phone).toBe("+40 799 853 625");
    expect(site.email).toBe("zavocreates@gmail.com");
    // Framer still links the template default "tel:+1 (555) 123-4567"; controller ruling: dial the shown number.
    expect(site.footer.phoneHref).toBe("tel:+40799853625");
  });

  it("has the three Framer breakpoints", () => {
    expect(getTokens().breakpoints.map((b) => [b.name, b.minWidth, b.frameWidth])).toEqual([
      ["desktop", 1200, 1200],
      ["tablet", 810, 810],
      ["phone", 0, 390],
    ]);
  });

  it("returns the page transition with Framer's exact tween", () => {
    expect(getMotion("page").transition).toEqual({
      type: "tween",
      duration: 0.2,
      ease: [0.27, 0, 0.51, 1],
      delay: 0,
    });
  });

  it("states a trigger for every effect", () => {
    const motion = read("motion.json") as Record<string, { kind: string; trigger?: string }>;
    for (const [id, e] of Object.entries(motion)) expect(e.trigger, id).toBeTruthy();
    expect(getMotion("pricing.card.hover")).toMatchObject({ trigger: "hover" });
    expect(getMotion("home.services.accordion")).toMatchObject({ trigger: "click" });
    expect(getMotion("pricing.timeline.row.appear")).toMatchObject({ trigger: "sectionInView", threshold: 0.5 });
  });

  it("throws on an unknown motion id", () => {
    expect(() => getMotion("nope")).toThrow("Unknown motion id: nope");
  });

  it("rejects a malformed home fixture", () => {
    const bad = structuredClone(read("home.json")) as { services: { bullets: string[] }[] };
    bad.services[0]!.bullets.push("Interaction design and micro-animations");
    expect(() => HomeContent.parse(bad)).toThrow();
    expect(() => HomeContent.parse({ ...(read("home.json") as object), extra: 1 })).toThrow();
  });
});
