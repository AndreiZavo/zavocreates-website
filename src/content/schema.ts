/**
 * Schemas for content/*.json (extracted from Framer, see docs/extraction/README.md).
 * Every object is strict: an unknown or missing key fails the build.
 */
import { z } from "zod";

const text = z.string().min(1);
const url = z.url();
const href = z.string().regex(/^(https:\/\/|mailto:|tel:|\/)/);
const cssLength = z.string().regex(/^-?[\d.]+(px|%|em|vh|fr)?( -?[\d.]+(px|%|em|vh|fr)?)*$|^(auto|1fr)$/);

// ------------------------------------------------------------------ shared
export const Image = z.strictObject({
  src: z.string().regex(/^\/images\/[a-z0-9-]+\.(png|jpg|gif|svg)$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
});
export type Image = z.infer<typeof Image>;

const Link = z.strictObject({ label: text, href });
const Intro = z.strictObject({ heading: text, text });
const EyebrowIntro = z.strictObject({ eyebrow: text, heading: text });
const Run = z.strictObject({ text, bold: z.literal(true).optional(), italic: z.literal(true).optional() });
const three = z.tuple([text, text, text]);

// ------------------------------------------------------------------ site
export const Site = z.strictObject({
  url: z.literal("https://zavocreates.com"),
  title: text,
  description: text,
  ogImage: Image,
  favicon: Image,
  phone: z.literal("+40 799 853 625"),
  email: z.literal("zavocreates@gmail.com"),
  instagram: url.optional(),
  tiktok: url,
  threads: url,
  // Framer tiles the noise GIF: repeat + size are its CSS background-repeat / background-size. The
  // canvas dump has no tile fields; the values are from the published HTML (docs/extraction/README.md).
  noise: z.strictObject({
    ...Image.shape,
    opacity: z.number().min(0).max(1),
    blendMode: text,
    repeat: z.enum(["repeat", "repeat-x", "repeat-y", "no-repeat"]),
    // CSS background-size: one or two of <length>|<percentage>|auto, or cover/contain.
    size: z.string().regex(/^(cover|contain)$|^([\d.]+(px|%)|auto)( ([\d.]+(px|%)|auto))?$/),
  }),
  nav: z.strictObject({
    avatar: Image,
    status: Link,
    links: z.array(Link).length(4),
    cta: Link,
  }),
  footer: z.strictObject({
    emailLabel: text,
    emailHref: href,
    phoneLabel: text,
    phoneHref: href,
    socialLabel: text,
    social: z
      .array(
        z.strictObject({
          network: z.enum(["instagram", "tiktok", "threads"]),
          href: url,
          icon: z.string().regex(/^\/icons\/[a-z0-9-]+\.svg$/),
        }),
      )
      .length(3),
    copyright: text,
    createdByLabel: text,
    createdByName: text,
    createdByHref: url,
  }),
});
export type Site = z.infer<typeof Site>;

// ------------------------------------------------------------------ home
export const Service = z.strictObject({
  title: text,
  bullets: three,
  /** Framer's Tablet & Phone variants show slightly different copy for some items. */
  tabletPhone: z.strictObject({ title: text.optional(), bullets: three.optional() }).optional(),
});
export type Service = z.infer<typeof Service>;

export const Counter = z.strictObject({ value: z.number().int().nonnegative(), suffix: z.string(), label: text });
export type Counter = z.infer<typeof Counter>;

const ProjectId = z.enum(["envato", "life", "blitz", "eye", "demmers", "kittl"]);
export const Project = z.strictObject({
  id: ProjectId,
  href: url,
  image: Image,
  badge: Image.optional(),
  overlay: z.string().startsWith("linear-gradient(").optional(),
});
export type Project = z.infer<typeof Project>;

const Field = z.strictObject({ label: text, placeholder: text, inputName: text });
export const ContactCopy = z.strictObject({
  heading: text,
  text,
  avatar: Image,
  fields: z.strictObject({ name: Field, email: Field, service: Field, message: Field, submit: text }),
  serviceOptions: z.tuple([text, text, text, text, text]),
  success: text,
  error: text,
});
export type ContactCopy = z.infer<typeof ContactCopy>;

const InfoCard = z.strictObject({ label: text, text, href });

export const HomeContent = z
  .strictObject({
    hero: z.strictObject({
      name: text,
      headingLeft: text,
      headingRight: text,
      tagline: text,
      avatarFront: Image,
      avatarBack: Image,
      badge: z.strictObject({ text, lottie: z.string().regex(/^\/lottie\/[a-z0-9-]+\.json$/) }),
    }),
    servicesIntro: Intro,
    services: z.tuple([Service, Service, Service, Service]),
    about: z.strictObject({
      heading: text,
      word: text,
      phonetic: text,
      partOfSpeech: text,
      definition: text,
      line: z.array(Run).min(1),
      counters: z.tuple([Counter, Counter, Counter]),
      phoneCard: InfoCard,
      emailCard: InfoCard,
    }),
    collaboratorsIntro: Intro,
    collaborators: z.array(Image).min(1),
    projectsIntro: Intro,
    projects: z.array(Project).length(6),
    projectOrder: z.strictObject({
      desktop: z.array(ProjectId).length(6),
      tablet: z.array(ProjectId).length(6),
      phone: z.array(ProjectId).min(1),
    }),
    contact: ContactCopy,
  })
  .refine((h) => new Set(h.projects.map((p) => p.id)).size === h.projects.length, "duplicate project id");
export type HomeContent = z.infer<typeof HomeContent>;

// ------------------------------------------------------------------ pricing
export const Point = z.strictObject({ number: z.string().regex(/^\d\d$/), title: text, body: text });
export const Step = z.strictObject({ ...Point.shape, side: z.enum(["left", "right"]) });
export const Faq = z.strictObject({
  q: text,
  lines: three,
  tabletPhone: z.strictObject({ q: text.optional(), lines: three.optional() }).optional(),
});
export type Faq = z.infer<typeof Faq>;
export const Package = z.strictObject({
  name: text,
  videos: text,
  price: z.string().regex(/^\d+ RON$/),
  blurb: text,
  cta: text,
  href: z.string().startsWith("https://calendly.com/"),
  /** width of the purple progress fill */
  progress: z.string().regex(/^\d+%$/),
  featured: z.boolean(),
  badge: text.optional(),
});
export type Package = z.infer<typeof Package>;

export const PricingContent = z.strictObject({
  lang: z.enum(["en", "ro"]),
  title: text,
  description: text,
  intro: z.strictObject({ eyebrow: text, heading: text, text }),
  points: z.tuple([Point, Point, Point]),
  processIntro: EyebrowIntro,
  process: z.tuple([Step, Step, Step, Step, Step]),
  faqIntro: EyebrowIntro,
  faq: z.tuple([Faq, Faq, Faq, Faq]),
  packagesIntro: EyebrowIntro,
  packages: z.tuple([Package, Package, Package, Package]),
  footnote: text,
  /** Owner addition, not on Framer: shown under the footnote at every breakpoint. */
  vatNote: text,
  /** The phone breakpoint adds a second line to the footnote. */
  footnotePhone: text.optional(),
  cta: z.strictObject({ heading: text, text, label: text, href }),
});
export type PricingContent = z.infer<typeof PricingContent>;

// ------------------------------------------------------------------ tokens
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const BreakpointName = z.enum(["desktop", "tablet", "phone"]);
const TextMetrics = z.strictObject({
  fontSize: cssLength,
  lineHeight: cssLength,
  letterSpacing: cssLength,
  paragraphSpacing: cssLength,
});
export const TextStyle = z.strictObject({
  framerId: text,
  framerName: text,
  fontFamily: z.enum(["Antonio", "Inter"]),
  fontWeight: z.number().int(),
  fontStyle: z.enum(["normal", "italic"]),
  textTransform: z.enum(["none", "uppercase"]),
  color: text,
  tag: z.enum(["h1", "h2", "h3", "h4", "p"]).optional(),
  breakpoints: z.strictObject({ desktop: TextMetrics, tablet: TextMetrics, phone: TextMetrics }),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const Tokens = z.strictObject({
  breakpoints: z
    .array(
      z.strictObject({
        name: BreakpointName,
        minWidth: z.number(),
        maxWidth: z.number().nullable(),
        frameWidth: z.number().int(),
        media: text,
      }),
    )
    .length(3),
  colorScheme: z.literal("light dark"),
  colors: z.record(kebab, z.strictObject({ light: text, dark: text, framerName: text, framerId: text })),
  fonts: z.array(z.strictObject({ family: z.enum(["Antonio", "Inter"]), weights: z.array(z.number().int()), source: text })),
  text: z.record(kebab, TextStyle),
  link: z.record(
    kebab,
    z.strictObject({ color: text, decoration: text, hoverColor: text, hoverDecoration: text, motion: text }),
  ),
  space: z.strictObject({ gaps: z.array(cssLength), paddings: z.array(cssLength) }),
  radii: z.array(cssLength),
  shadows: z.record(kebab, text),
});
export type Tokens = z.infer<typeof Tokens>;

// ------------------------------------------------------------------ motion
export const Transition = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("spring"),
    stiffness: z.number().optional(),
    damping: z.number().optional(),
    mass: z.number().optional(),
    duration: z.number().optional(),
    bounce: z.number().optional(),
    delay: z.number().optional(),
    stagger: z.number().optional(),
  }),
  z.strictObject({
    type: z.literal("tween"),
    duration: z.number(),
    ease: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    delay: z.number().optional(),
  }),
  /** Scroll-linked or state changes without an animated transition in Framer. */
  z.strictObject({ type: z.literal("instant") }),
]);
export type Transition = z.infer<typeof Transition>;

export const Pose = z.strictObject({
  opacity: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  rotate: z.number().optional(),
  rotateX: z.number().optional(),
  rotateY: z.number().optional(),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  boxShadow: z.string().optional(),
  backgroundColor: z.string().optional(),
  color: z.string().optional(),
});
export type Pose = z.infer<typeof Pose>;

const Prim = z.union([z.string(), z.number(), z.boolean()]).nullable();
/** layer path -> property -> [from, to] (Framer variant A vs variant B) */
const StateDiff = z.record(z.string(), z.record(z.string(), z.tuple([Prim, Prim])));
const BpStateDiff = z.strictObject({ desktop: StateDiff, tabletPhone: StateDiff });
const ScrollSection = z.strictObject({
  at: z.enum(["start", "target"]),
  target: z.strictObject({ framerNodeId: text, description: text }).optional(),
  pose: Pose,
});

const base = {
  element: text,
  page: z.enum(["home", "pricing", "all"]),
  section: text,
  framerNodeId: text,
  transition: Transition,
  note: text.optional(),
};
const CounterFont = z.strictObject({
  fontSelector: text,
  fontSize: z.union([z.number(), z.string()]),
  letterSpacing: z.tuple([z.number(), z.string()]),
  lineHeight: z.tuple([z.number(), z.string()]),
  openTypeFontFeatures: z.array(z.string()),
});

export const Effect = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("page"),
    trigger: z.literal("navigation"),
    enter: z.strictObject({ from: Pose, to: Pose, transition: Transition }),
    exit: z.strictObject({ to: Pose, transition: Transition }),
  }),
  z.strictObject({ ...base, kind: z.literal("smoothScroll"), trigger: z.literal("scroll"), intensity: z.number(), perPage: z.record(z.string(), z.number()) }),
  z.strictObject({ ...base, kind: z.literal("sticky"), trigger: z.literal("scroll"), top: text, containerHeight: text, trackHeight: text }),
  z.strictObject({
    ...base,
    kind: z.literal("appear"),
    trigger: z.enum(["load", "inView", "sectionInView"]),
    threshold: z.number().min(0).max(1),
    replay: z.boolean(),
    from: Pose,
    to: Pose,
    rows: z
      .array(
        z.strictObject({
          row: z.number().int(),
          framerNodeId: text,
          from: Pose.optional(),
          threshold: z.number().optional(),
        }),
      )
      .optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("scroll"),
    trigger: z.literal("scrollTarget"),
    viewport: z.enum(["start", "middle", "end"]),
    sections: z.array(ScrollSection).min(2),
    breakpointSections: z
      .strictObject({ tablet: z.array(ScrollSection).nullable(), phone: z.array(ScrollSection).nullable() })
      .optional(),
    rows: z.array(z.strictObject({ row: text, framerNodeId: text, sections: z.array(ScrollSection) })).optional(),
    /**
     * Breakpoints where each element instead fills its parent line as the viewport line passes along
     * that line (fill: element height; empty at the first section's pose). Owner request, not Framer.
     */
    lineFollow: z.array(z.enum(["tablet", "phone"])).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("variant"),
    trigger: z.enum(["click", "timer"]),
    states: z.union([BpStateDiff, StateDiff]).optional(),
    hover: StateDiff.optional(),
    cycle: z
      .array(
        z.strictObject({
          variant: text,
          shows: z.enum(["text", "lottie"]),
          stackDistribution: text,
          holdSeconds: z.number(),
        }),
      )
      .optional(),
    loop: z.boolean().optional(),
    holdSeconds: z.number().optional(),
    returnTransition: Transition.optional(),
    lottie: z
      .strictObject({ src: text, loop: z.boolean(), speed: z.number(), color1: text, color2: text })
      .optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("hover"),
    trigger: z.literal("hover"),
    to: Pose.optional(),
    states: StateDiff.optional(),
    pressed: StateDiff.optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("marquee"),
    trigger: z.literal("always"),
    speed: z.number(),
    direction: z.enum(["left", "right", "top", "bottom"]),
    gap: z.number(),
    padding: text,
    alignment: text,
    hoverFactor: z.number(),
    fade: z.strictObject({
      fadeContent: z.boolean(),
      overflow: z.boolean(),
      fadeWidth: z.number(),
      fadeInset: z.number(),
      fadeAlpha: z.number(),
    }),
    height: text,
    phone: z.strictObject({ width: text, speed: z.number(), gap: z.number() }),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("counter"),
    trigger: z.literal("inView"),
    replay: z.boolean(),
    start: z.number(),
    decimals: z.number().int(),
    commas: z.boolean(),
    font: z.strictObject({ desktop: CounterFont, phone: CounterFont }),
    color: text,
  }),
  z.strictObject({ ...base, kind: z.literal("loop"), trigger: z.literal("always"), to: Pose, repeat: z.enum(["loop", "mirror", "reverse"]) }),
  z.strictObject({
    ...base,
    kind: z.literal("scrollVariant"),
    trigger: z.literal("onScrollDirection"),
    direction: z.enum(["up", "down"]),
    replay: z.boolean(),
    states: BpStateDiff,
  }),
  z.strictObject({
    ...base,
    kind: z.literal("cursor"),
    trigger: z.literal("pointerMove"),
    default: z.strictObject({ size: z.number(), fill: text, radius: text }),
    blending: z.strictObject({ size: z.number(), fill: text, blendMode: text, usedOn: z.array(text) }),
    follow: z.boolean(),
    offsetX: z.number(),
    offsetY: z.number(),
    placement: text,
    alignment: text,
  }),
]);
export type Effect = z.infer<typeof Effect>;

export const Motion = z
  .record(z.string().regex(/^[a-zA-Z]+(\.[a-zA-Z]+)*$/), Effect)
  .refine((m) => "page" in m, "motion.json must define the page transition");
export type Motion = z.infer<typeof Motion>;

// ------------------------------------------------------------------ layout
const v = z.union([z.string(), z.number(), z.boolean()]);
const layoutKeys = [
  "aspectRatio", "backfaceVisibility", "backgroundBlur", "blendingMode", "border", "borderBottom", "borderColor",
  "borderLeft", "borderRight", "borderStyle", "borderTop", "borderWidth", "bottom", "centerAnchorX", "centerAnchorY",
  "cursor", "elementId", "fill", "fillImagePositionX", "fillImagePositionY", "fontName", "fontSize", "fontWeight", "gap",
  "gridAlignment", "gridColumnCount", "gridColumnMinWidth", "gridItemColumnSpan", "gridItemHorizontalAlignment",
  "gridItemVerticalAlignment", "gridRowCount", "gridRowHeight", "gridRowHeightType", "height", "htmlTag", "layout",
  "left", "letterSpacing", "lineHeight", "maxWidth", "minHeight", "opacity", "openTypeFontFeatures", "overflow",
  "overflowX", "padding", "perspective", "position", "positionStickyTop", "preserve3d", "radius", "radiusTopLeft",
  "radiusTopRight", "radiusBottomRight", "radiusBottomLeft", "right", "rotateX", "rotateY", "rotateZ", "rotation",
  "scrollMarginTop", "stackAlignment", "stackDirection", "stackDistribution", "stackWrapEnabled", "tag",
  "textAlignment", "textColor", "textTransform", "textVerticalAlignment", "textWrap", "top", "transformOriginX",
  "transformOriginY", "translateZ", "width", "x", "y", "zIndex", "formInputPlaceholderColor", "formInputFocusedBorder",
  "formInputIconColor", "formTextInputType", "formTextAreaResizable", "formInputRequired",
] as const;
export const LayoutProps = z.strictObject(
  Object.fromEntries(layoutKeys.map((k) => [k, v.optional()])) as Record<(typeof layoutKeys)[number], z.ZodOptional<typeof v>>,
);

export type LayoutNode = {
  kind: "frame" | "text" | "component" | "image" | "vector" | "input";
  name: string;
  framerId: string;
  props: z.infer<typeof LayoutProps>;
  preset?: string | undefined;
  preview?: string | undefined;
  component?: string | undefined;
  variant?: string | undefined;
  src?: string | undefined;
  children?: LayoutNode[] | undefined;
};
export const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() =>
  z.strictObject({
    kind: z.enum(["frame", "text", "component", "image", "vector", "input"]),
    name: text,
    framerId: text,
    props: LayoutProps,
    preset: z.string().optional(),
    preview: z.string().optional(),
    component: text.optional(),
    variant: text.optional(),
    src: z.string().regex(/^\/images\/[a-z0-9-]+\.svg$/).optional(),
    children: z.array(LayoutNode).optional(),
  }),
);
const BpTrees = z.strictObject({ desktop: LayoutNode, tablet: LayoutNode, phone: LayoutNode });
export const Layout = z.strictObject({
  note: text,
  pages: z.strictObject({ home: BpTrees, pricing: BpTrees, template: BpTrees }),
  components: z.record(text, z.record(text, LayoutNode)),
});
export type Layout = z.infer<typeof Layout>;
