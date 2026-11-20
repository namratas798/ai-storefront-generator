import { NextResponse } from "next/server";
import { getStats, getStore } from "@/lib/store";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("slug") || "";
  const key = u.searchParams.get("key") || "";
  const s = await getStore(slug).catch(() => null);
  if (!s || s.editKey !== key) return NextResponse.json({ status: "error" }, { status: 404 });
  return NextResponse.json({ status: "ok", ...(await getStats(slug, s.products.map((p) => p.id))) });
}
