import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import PublicStore from "@/components/PublicStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await getStore(slug.toLowerCase());
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const s = await load((await params).slug);
  if (!s) return { title: "Store not found" };
  const title = `${s.creator.displayName} — ${s.creator.niche}`;
  return {
    title,
    description: s.creator.tagline,
    openGraph: { title, description: s.creator.tagline, type: "profile" },
    twitter: { card: "summary", title, description: s.creator.tagline },
  };
}

export default async function Page({ params }: Params) {
  const s = await load((await params).slug);
  if (!s) notFound();
  // Never ship the edit key or delivery links to visitors: buyers get those only after paying.
  const { editKey: _k, ...rest } = s;
  const publicStore = { ...rest, products: rest.products.map(({ delivery: _d, ...p }) => p) };
  return <PublicStore store={publicStore} />;
}
