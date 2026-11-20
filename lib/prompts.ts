import { pricingGuide } from "./pricing";
import { AUDIENCE_LABEL, FORMATS, THEMES, type Audience, type Language, type Store } from "./schema";
import type { IgProfile } from "./instagram";

const LANGUAGE_RULE: Record<Language, string> = {
  english: "Write all creator-facing copy in simple, warm Indian English (Class 10 reading level).",
  hinglish:
    "Write all copy in natural Hinglish (Hindi words in Roman script mixed with English, the way Indian creators write Instagram captions). Product titles may stay mostly English.",
  hindi:
    "Write all copy in simple Hindi using Devanagari script. Common English words (course, e-book, live, PDF) may stay in English.",
};

export const SYSTEM = `You are the storefront strategist at SuperProfile, helping Indian creators launch their first store in minutes.
You think like a creator-economy coach who knows Indian audiences: price-sensitive, UPI-native, buying on mobile, and trusting people before products.

Principles:
1. Sell what this creator can credibly deliver THIS WEEK from their existing expertise. No vague "masterclass on success".
2. Build a product ladder: one low-ticket entry product (impulse buy, ≤ ₹599) to earn the first sale and trust, then one or two higher-value products (live / personal / deeper). Use different formats.
3. Titles are concrete and outcome-led ("21-Day Home Workout Plan for Busy Moms"), never hypey.
4. Descriptions: 50–90 words. Who it's for → what they get → why from this creator. Specific, scannable, no ALL CAPS, no emoji spam (max 1 emoji).
5. Never promise guaranteed results, returns, income, cures or weight loss. Finance creators must frame as education (SEBI rules); health and astrology creators must not make medical or certain-outcome claims.
6. Do not invent fake facts: never call them "certified", no made-up follower counts, certifications, awards, years of experience or numbers of clients/students ("helped 500+", "dozens of moms"). If you need a credential you don't know, leave it out.
7. Output ONLY a single JSON object that matches the schema exactly.`;

const SCHEMA_TEXT = `{
  "inputQuality": "good" | "vague" | "gibberish",
  "clarifyingQuestion": string | null,   // ONLY when inputQuality is "gibberish": one friendly question asking what they do
  "assumptions": string[],               // 0-3 short assumptions you made when input was thin, e.g. "You coach beginners, mostly women"
  "creator": {                         // null only when gibberish
    "displayName": string,               // the creator's real name if given; otherwise a readable form of the handle (e.g. @fitwithpriya → "Fit With Priya"); if neither, exactly "Your Name"
    "niche": string,                     // 2-4 words, e.g. "Home fitness coach"
    "tagline": string,                   // max 70 chars, the one-line promise
    "bio": string                        // 2-3 sentences, first person, 180-350 chars, builds trust
  },
  "products": [                          // 3 products by default (2-4 allowed), each a DIFFERENT format
    {
      "format": ${FORMATS.map((f) => `"${f}"`).join(" | ")},
      "title": string,                   // max 60 chars
      "description": string,             // 50-90 words
      "deliverables": string[],          // 3 short bullets of what the buyer gets
      "price": integer,                  // INR, inside the guardrail for the format
      "priceRationale": string,          // 1-2 sentences to the creator, in plain words: why this price works for their buyers. Never mention guardrails, bands, ranges or follower brackets.
      "ctaLabel": string                 // 2-4 words, e.g. "Get the plan", "Book a call"
    }
  ],
  "theme": ${THEMES.map((t) => `"${t}"`).join(" | ")}   // sunrise = warm/lifestyle/food/fashion, mint = health/fitness/education, midnight = finance/tech/design/astrology
}`;

/** Models don't know today's date; finance and exam creators need the right year. */
function today() {
  const d = new Date();
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return `Today is ${date}. The current Indian financial year is FY ${fyStart}-${String(fyStart + 1).slice(2)}. Never mention an older year as current.`;
}

export function storePrompt(args: {
  handle: string;
  description: string;
  audience: Audience;
  language: Language;
  ig: IgProfile | null;
}) {
  const { handle, description, audience, language, ig } = args;
  const igBlock = ig
    ? `Instagram profile we could read:
- Name: ${ig.fullName ?? "unknown"}
- Followers: ${ig.followers ?? "unknown"}
- Bio: ${ig.bio ?? "(none)"}`
    : handle
      ? `Instagram handle: @${handle} (we could not read the profile — rely on the description).`
      : "No Instagram handle given.";

  return `Create a ready-to-publish storefront for this creator.
${today()}

${igBlock}
Creator's own description: """${description || "(none given)"}"""
Audience size: ${AUDIENCE_LABEL[audience]} followers
${audience === "under_1k" ? "This creator has a very small audience: favour personal, high-trust formats (1:1 sessions, small live workshops) and low entry prices. Avoid communities that need many members to feel alive.\n" : ""}
Pricing guardrails for this audience size (INR; stay inside these):
${pricingGuide(audience)}

Language: ${LANGUAGE_RULE[language]}

Input quality rules:
- "good": we know roughly what they do.
- "vague": e.g. a single word like "fitness" or "I make videos". Still generate a strong store, but list the assumptions you made.
- "gibberish": random characters or nothing meaningful (a handle alone with no clear niche counts too). Set creator to null, products to [], and set clarifyingQuestion.

Return JSON with exactly this shape:
${SCHEMA_TEXT}`;
}

export function regeneratePrompt(args: {
  store: Store;
  part: "bio" | "product" | "new_product";
  productId?: string;
  instruction?: string;
}) {
  const { store, part, productId, instruction } = args;
  const context = `Current store (JSON):
${JSON.stringify(
  {
    creator: store.creator,
    products: store.products.map(({ id, format, title, price }) => ({ id, format, title, price })),
  },
  null,
  1
)}
Audience size: ${AUDIENCE_LABEL[store.audience]}
${today()}
Language: ${LANGUAGE_RULE[store.language]}
${instruction ? `The creator asked: """${instruction}"""` : "The creator wants a fresh alternative — make it noticeably different, not a rephrase."}`;

  if (part === "bio") {
    return `${context}

Rewrite ONLY the creator header (tagline + bio). Keep displayName and niche unless the instruction says otherwise.
Return JSON: { "displayName": string, "niche": string, "tagline": string (max 70 chars), "bio": string (180-350 chars, first person) }`;
  }

  const current = store.products.find((p) => p.id === productId);
  const usedFormats = store.products.filter((p) => p.id !== productId).map((p) => p.format);
  return `${context}

${
  part === "product" && current
    ? `Replace this product: ${JSON.stringify({ format: current.format, title: current.title, price: current.price })}.
${instruction ? "Follow the creator's instruction; you may keep the same format if it fits." : "Propose a different product idea."}`
    : "Suggest ONE additional product that completes the product ladder."
}
Do NOT use these formats already in the store: ${usedFormats.join(", ") || "(none)"}.

Pricing guardrails (INR):
${pricingGuide(store.audience)}

Return JSON for one product:
{ "format": ${FORMATS.map((f) => `"${f}"`).join(" | ")}, "title": string, "description": string (50-90 words), "deliverables": string[3], "price": integer, "priceRationale": string (plain words to the creator; never mention bands or ranges), "ctaLabel": string }`;
}
