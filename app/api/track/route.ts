import { NextResponse } from "next/server";
import { track } from "@/lib/store";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.slug !== "string" || !["view", "click"].includes(b.event)) return NextResponse.json({ ok: false });
  try {
    await track(b.slug.slice(0, 40), b.event, typeof b.productId === "string" ? b.productId.slice(0, 40) : undefined);
  } catch {}
  return NextResponse.json({ ok: true });
}
