import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Owner-only: the full store, including private delivery links, for editing. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const s = await getStore(u.searchParams.get("slug") || "").catch(() => null);
  if (!s || s.editKey !== (u.searchParams.get("key") || "")) {
    return NextResponse.json({ status: "error" }, { status: 404 });
  }
  const { editKey: _k, slug: _s, publishedAt: _p, updatedAt: _u, ...store } = s;
  return NextResponse.json({ status: "ok", store });
}
