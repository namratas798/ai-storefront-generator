import type { Audience, Format } from "./schema";

/**
 * India price guardrails per format, in INR.
 * The LLM proposes a price; we never trust it blindly. We clamp it into the band for the
 * format, shifted by audience size, then snap to a familiar "charm" price (₹499, ₹999...).
 * Bands are based on what Indian long-tail creators typically charge on link-in-bio stores.
 */
export const PRICE_BANDS: Record<Format, { min: number; max: number; unit?: string }> = {
  ebook: { min: 99, max: 599 },
  template_pack: { min: 149, max: 999 },
  workshop: { min: 99, max: 999 },
  recorded_course: { min: 499, max: 3999 },
  one_on_one: { min: 299, max: 2999 },
  cohort_course: { min: 1499, max: 9999 },
  community: { min: 99, max: 999, unit: "/month" },
};

// Smaller audiences sit at the bottom of the band; big audiences can stretch to the top.
const AUDIENCE_WINDOW: Record<Audience, [number, number]> = {
  under_5k: [0, 0.45],
  "5k_20k": [0, 0.65],
  "20k_100k": [0.1, 0.85],
  over_100k: [0.2, 1],
};

const CHARM = [
  99, 149, 199, 249, 299, 349, 399, 449, 499, 599, 699, 799, 899, 999, 1199, 1299, 1499, 1799,
  1999, 2499, 2999, 3499, 3999, 4499, 4999, 5999, 6999, 7999, 8999, 9999,
];

export function priceRange(format: Format, audience: Audience) {
  const b = PRICE_BANDS[format];
  const [lo, hi] = AUDIENCE_WINDOW[audience];
  const span = b.max - b.min;
  return { min: snap(b.min + span * lo), max: snap(b.min + span * hi) };
}

function snap(n: number) {
  let best = CHARM[0];
  for (const c of CHARM) if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  return best;
}

/** Returns a price that is inside the guardrail and looks like a price Indians are used to. */
export function guardPrice(format: Format, audience: Audience, proposed: number) {
  const { min, max } = priceRange(format, audience);
  const clamped = Math.min(max, Math.max(min, Number.isFinite(proposed) ? proposed : min));
  const snapped = snap(clamped);
  return { price: Math.min(max, Math.max(min, snapped)), adjusted: snapped !== proposed };
}

export function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

/** Text block handed to the LLM so it proposes sensible prices to begin with. */
export function pricingGuide(audience: Audience) {
  return (Object.keys(PRICE_BANDS) as Format[])
    .map((f) => {
      const r = priceRange(f, audience);
      return `- ${f}: ₹${r.min}–₹${r.max}${PRICE_BANDS[f].unit ?? ""}`;
    })
    .join("\n");
}
