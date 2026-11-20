import { guardPrice, formatINR } from "./pricing";
import type { Audience, LlmStore, Product } from "./schema";

/* ---------------- Input checks (before we spend an LLM call) ---------------- */

export function normalizeHandle(raw: string): { handle: string; valid: boolean } {
  let h = (raw || "").trim();
  // Accept pasted profile links: instagram.com/name, https://www.instagram.com/name/?hl=en
  const m = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@+/, "").trim();
  if (!h) return { handle: "", valid: true };
  const valid = /^[a-zA-Z0-9._]{1,30}$/.test(h) && !/^\.|\.$|\.\./.test(h);
  return { handle: valid ? h.toLowerCase() : h, valid };
}

/**
 * Cheap heuristic for keyboard-mash input ("asdfgh", "kkkkkk", "123123").
 * The LLM also grades input quality; this just saves a call on obvious junk.
 */
export function looksLikeGibberish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // Devanagari and other scripts: let the model judge.
  if (/[ऀ-ॿ]/.test(t)) return false;
  const letters = t.replace(/[^a-z]/g, "");
  if (letters.length < 2) return true;
  if (/(.)\1{4,}/.test(t)) return true;
  const vowels = letters.replace(/[^aeiouy]/g, "").length;
  if (letters.length >= 6 && vowels / letters.length < 0.12) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const longNoVowel = words.filter((w) => w.length >= 5 && !/[aeiouy]/.test(w)).length;
  return words.length > 0 && longNoVowel / words.length > 0.5;
}

/* ---------------- Output checks (after the LLM answers) ---------------- */

// Claims that are risky for Indian creators (SEBI rules for finance, health/astrology claims).
const RISKY = [
  /guarantee(d)?\s+(returns?|profits?|results?|income|weight\s*loss)/i,
  /assured\s+returns?/i,
  /double\s+your\s+money/i,
  /\b100%\s+(results?|guaranteed|cure|success)/i,
  /\bcures?\b\s+(diabetes|cancer|pcos|thyroid|disease)/i,
  /\bstock\s+tips?\b/i,
  /\bget\s+rich\s+quick\b/i,
];

// Made-up track records ("helped 500+ students", "guided dozens of moms") that the creator never gave us.
const INVENTED = /\b(\d[\d,]*\+?|dozens|hundreds|thousands|lakhs?)\s+(of\s+)?(happy\s+|satisfied\s+)?(clients|students|moms|mothers|women|learners|customers|followers|families|professionals)\b/i;

// Made-up experience ("10+ years", "years of studying").
const EXPERIENCE = /\b(\d+\+?\s+years|years\s+of\s+\w+|decades?\s+of\s+\w+)/i;
// Credentials and audience boasts the creator didn't give us ("certified", "award-winning", "5K+ followers").
const CREDENTIAL = /\b(certified|certification|award[- ]winning|gold medal(?:ist)?|ranked|registered dietitian|\d+(?:\.\d+)?\s*[kKmL]\+?\s+(?:followers|subscribers))\b/i;

export function qualityIssues(store: LlmStore, source = ""): string[] {
  const issues: string[] = [];
  const text = JSON.stringify(store);
  for (const re of [INVENTED, EXPERIENCE, CREDENTIAL]) {
    const claim = text.match(re);
    if (claim && !source.toLowerCase().includes(claim[0].toLowerCase())) {
      issues.push(`Remove the invented claim "${claim[0]}" — the creator never said this. Describe what they do instead.`);
    }
  }
  for (const r of RISKY) {
    const m = text.match(r);
    if (m) issues.push(`Remove the risky claim "${m[0]}" — rephrase without promising outcomes.`);
  }
  const formats = store.products.map((p) => p.format);
  if (new Set(formats).size < formats.length) {
    issues.push("Each product must use a different format.");
  }
  const titles = store.products.map((p) => p.title.toLowerCase());
  if (new Set(titles).size < titles.length) issues.push("Product titles must be distinct.");
  if (store.inputQuality !== "gibberish" && !store.products.some((p) => p.price <= 599)) {
    issues.push("Include at least one entry-level product priced at ₹599 or less.");
  }
  return issues;
}

/** Deterministic clean-up we always apply, whatever the model said. */
export function finalizeProducts(
  products: LlmStore["products"],
  audience: Audience
): Product[] {
  return products.map((p) => {
    const { price } = guardPrice(p.format, audience, p.price);
    // If the model restated a price in its rationale, make it match the final price.
    const priceRationale = p.priceRationale.replace(/₹\s?[\d,]+/g, (m) =>
      Number(m.replace(/[^\d]/g, "")) === p.price ? formatINR(price) : m
    );
    return {
      ...p,
      id: crypto.randomUUID().slice(0, 8),
      price,
      priceRationale,
      title: p.title.trim(),
      description: p.description.trim(),
    };
  });
}
