import { z } from "zod";

export const FORMATS = [
  "ebook",
  "template_pack",
  "recorded_course",
  "cohort_course",
  "one_on_one",
  "workshop",
  "community",
] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  ebook: "E-book / Guide",
  template_pack: "Template pack",
  recorded_course: "Recorded course",
  cohort_course: "Live cohort",
  one_on_one: "1:1 session",
  workshop: "Live workshop",
  community: "Community",
};

export const AUDIENCE = ["under_5k", "5k_20k", "20k_100k", "over_100k"] as const;
export type Audience = (typeof AUDIENCE)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = {
  under_5k: "Under 5K",
  "5k_20k": "5K–20K",
  "20k_100k": "20K–100K",
  over_100k: "100K+",
};

export const LANGUAGES = ["english", "hinglish", "hindi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["sunrise", "mint", "midnight"] as const;
export type Theme = (typeof THEMES)[number];

/* ---------- What the creator gives us ---------- */
export const GenerateInput = z.object({
  handle: z.string().max(80).optional().default(""),
  description: z.string().max(600).optional().default(""),
  audience: z.enum(AUDIENCE).optional().default("5k_20k"),
  language: z.enum(LANGUAGES).optional().default("english"),
});
export type GenerateInput = z.infer<typeof GenerateInput>;

/* ---------- What the LLM must return (validated) ---------- */
export const LlmProduct = z.object({
  format: z.enum(FORMATS),
  title: z.string().min(4).max(70),
  description: z.string().min(80).max(650),
  deliverables: z.array(z.string().min(2).max(80)).min(2).max(4),
  price: z.coerce.number().int().positive(),
  priceRationale: z.string().min(20).max(260),
  ctaLabel: z.string().min(2).max(24),
});

export const LlmCreator = z.object({
  displayName: z.string().min(1).max(40),
  niche: z.string().min(2).max(40),
  tagline: z.string().min(5).max(80),
  bio: z.string().min(60).max(420),
});

export const LlmStore = z
  .object({
    inputQuality: z.enum(["good", "vague", "gibberish"]),
    clarifyingQuestion: z.string().max(200).nullish(),
    assumptions: z.array(z.string().max(160)).max(3).nullish(),
    creator: LlmCreator.nullish(),
    products: z.array(LlmProduct).max(4).default([]),
    theme: z.enum(THEMES).catch("sunrise"),
  })
  .superRefine((s, ctx) => {
    if (s.inputQuality === "gibberish") return;
    if (!s.creator) ctx.addIssue({ code: "custom", path: ["creator"], message: "creator is required" });
    if (s.products.length < 2)
      ctx.addIssue({ code: "custom", path: ["products"], message: "return 2 to 4 products" });
  });
export type LlmStore = z.infer<typeof LlmStore>;

/* ---------- What we store and render ---------- */
export type Product = z.infer<typeof LlmProduct> & { id: string };

export type Store = {
  handle: string;
  audience: Audience;
  language: Language;
  theme: Theme;
  creator: z.infer<typeof LlmCreator>;
  products: Product[];
  assumptions: string[];
};

export const StoreSchema = z.object({
  handle: z.string().max(40),
  audience: z.enum(AUDIENCE),
  language: z.enum(LANGUAGES),
  theme: z.enum(THEMES),
  creator: z.object({
    displayName: z.string().max(60),
    niche: z.string().max(60),
    tagline: z.string().max(120),
    bio: z.string().max(600),
  }),
  products: z
    .array(
      z.object({
        id: z.string().max(40),
        format: z.enum(FORMATS),
        title: z.string().max(100),
        description: z.string().max(900),
        deliverables: z.array(z.string().max(120)).max(6),
        price: z.number().int().min(0).max(200000),
        priceRationale: z.string().max(400),
        ctaLabel: z.string().max(30),
      })
    )
    .min(1)
    .max(4),
  assumptions: z.array(z.string()).max(5),
});
