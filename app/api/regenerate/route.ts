import { NextResponse } from "next/server";
import { z } from "zod";
import { LlmCreator as Header, LlmProduct, StoreSchema, type Store } from "@/lib/schema";
import { generateStructured } from "@/lib/llm";
import { SYSTEM, regeneratePrompt } from "@/lib/prompts";
import { finalizeProducts } from "@/lib/quality";

export const maxDuration = 60;

const Body = z.object({
  store: StoreSchema,
  part: z.enum(["bio", "product", "new_product"]),
  productId: z.string().optional(),
  instruction: z.string().max(200).optional(),
});


export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Couldn't read that request." }, { status: 400 });
  const { part, productId, instruction } = parsed.data;
  const store = parsed.data.store as Store;
  const user = regeneratePrompt({ store, part, productId, instruction: instruction?.trim() || undefined });

  if (part === "bio") {
    const r = await generateStructured({ system: SYSTEM, user }, Header);
    if (!r.ok) return fail();
    return NextResponse.json({ status: "ok", creator: r.data });
  }

  const others = store.products.filter((p) => p.id !== productId).map((p) => p.format);
  const r = await generateStructured({ system: SYSTEM, user }, LlmProduct, (p) =>
    others.includes(p.format) ? [`Format "${p.format}" is already used. Pick a different format.`] : []
  );
  if (!r.ok) return fail();
  const [product] = finalizeProducts([r.data], store.audience);
  return NextResponse.json({ status: "ok", product });
}

function fail() {
  return NextResponse.json(
    { status: "error", message: "Couldn't regenerate right now — your current version is kept. Try again?" },
    { status: 503 }
  );
}
