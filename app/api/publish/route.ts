import { NextResponse } from "next/server";
import { z } from "zod";
import { StoreSchema, type Store } from "@/lib/schema";
import { getStore, saveStore, uniqueSlug } from "@/lib/store";

const Body = z.object({
  store: StoreSchema,
  slug: z.string().max(40).optional(),
  editKey: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { status: "error", message: `Please check your page: ${first?.path.join(" › ")} ${first?.message}`.trim() },
      { status: 400 }
    );
  }
  const store = parsed.data.store as Store;
  if (!store.creator.displayName.trim() || store.products.some((p) => !p.title.trim())) {
    return NextResponse.json({ status: "error", message: "Your name and every product title need some text." }, { status: 400 });
  }
  const now = Date.now();
  try {
    // Update an existing page if the caller owns it.
    if (parsed.data.slug && parsed.data.editKey) {
      const existing = await getStore(parsed.data.slug);
      if (existing && existing.editKey === parsed.data.editKey) {
        await saveStore({ ...store, slug: existing.slug, editKey: existing.editKey, publishedAt: existing.publishedAt, updatedAt: now });
        return NextResponse.json({ status: "ok", slug: existing.slug, editKey: existing.editKey, updated: true });
      }
    }
    const slug = await uniqueSlug(store.handle || store.creator.displayName);
    const editKey = crypto.randomUUID().replace(/-/g, "");
    await saveStore({ ...store, slug, editKey, publishedAt: now, updatedAt: now });
    return NextResponse.json({ status: "ok", slug, editKey, updated: false });
  } catch (e) {
    console.error("[publish]", e);
    return NextResponse.json({ status: "error", message: "Couldn't publish just now. Your draft is safe — try again." }, { status: 503 });
  }
}
