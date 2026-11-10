/**
 * Typed, validated access to content/*.json. Parsing happens once per file at import
 * time, so a malformed or incomplete content file fails `astro build` and the tests.
 */
import homeJson from "../../content/home.json";
import layoutJson from "../../content/layout.json";
import motionJson from "../../content/motion.json";
import pricingEnJson from "../../content/pricing.en.json";
import pricingRoJson from "../../content/pricing.ro.json";
import siteJson from "../../content/site.json";
import tokensJson from "../../content/tokens.json";
import {
  type Effect,
  HomeContent,
  Layout,
  Motion,
  PricingContent,
  Site,
  Tokens,
} from "./schema";

const site = Site.parse(siteJson);
const home = HomeContent.parse(homeJson);
const pricing = { en: PricingContent.parse(pricingEnJson), ro: PricingContent.parse(pricingRoJson) } as const;
const tokens = Tokens.parse(tokensJson);
const motion = Motion.parse(motionJson);
const layout = Layout.parse(layoutJson);

export const getSite = (): Site => site;
export const getHome = (): HomeContent => home;
export const getPricing = (lang: "en" | "ro"): PricingContent => pricing[lang];
export const getTokens = (): Tokens => tokens;
export const getLayout = (): Layout => layout;

export function getMotion(id: string): Effect {
  const effect = Object.hasOwn(motion, id) ? motion[id] : undefined;
  if (!effect) throw new Error(`Unknown motion id: ${id}`);
  return effect;
}
