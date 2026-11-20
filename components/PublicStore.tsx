"use client";

import { useEffect, useState } from "react";
import StoreView from "./StoreView";
import type { Product, Store } from "@/lib/schema";
import { formatINR } from "@/lib/pricing";
import { THEME_STYLES } from "@/lib/themes";

type PublicStoreData = Store & { slug: string; publishedAt: number; updatedAt: number };

export default function PublicStore({ store }: { store: PublicStoreData }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);
  const t = THEME_STYLES[store.theme];

  useEffect(() => {
    let key: string | null = null;
    try {
      key = JSON.parse(localStorage.getItem("sf_owned_v1") || "{}")[store.slug] ?? null;
    } catch {}
    setOwner(key);
    // Count views from real visitors only (not the creator checking their own page).
    if (!key) beacon({ slug: store.slug, event: "view" });
  }, [store.slug]);

  function buy(p: Product) {
    if (!owner) beacon({ slug: store.slug, event: "click", productId: p.id });
    setPicked(p);
  }

  async function edit() {
    const { slug, publishedAt: _a, updatedAt: _b, ...publicRest } = store;
    // The public page has no delivery links, so load the owner's full copy before editing.
    const full = await fetch(`/api/store?slug=${encodeURIComponent(slug)}&key=${encodeURIComponent(owner ?? "")}`)
      .then((r) => r.json())
      .catch(() => null);
    const rest = full?.status === "ok" ? full.store : publicRest;
    try {
      localStorage.setItem(
        "sf_draft_v1",
        JSON.stringify({ step: "edit", input: { handle: rest.handle, description: "", audience: rest.audience, language: rest.language }, store: rest, slug, editKey: owner })
      );
    } catch {}
    window.location.href = "/";
  }

  const isExample = store.slug === (process.env.NEXT_PUBLIC_EXAMPLE_SLUG || "example-creator");

  return (
    <main className="mx-auto max-w-md min-h-dvh shadow-[0_0_40px_rgba(0,0,0,0.06)]" style={{ background: t.bg }}>
      {isExample && (
        <div className="sticky top-0 z-30 bg-[#16131f] text-white text-[13px] px-4 py-2.5 flex items-center gap-3">
          <span className="flex-1">Example store, made by AI from one line of description.</span>
          <a href="/" className="font-bold underline underline-offset-2 whitespace-nowrap">Make yours →</a>
        </div>
      )}
      <StoreView store={store} onBuy={buy} />
      <footer className="text-center text-[11px] pb-8" style={{ color: t.muted }}>
        <a href="/" className="underline underline-offset-2">Make your own store in a minute ✨</a>
      </footer>

      {owner && (
        <button
          onClick={edit}
          className="fixed bottom-5 right-5 z-30 px-4 py-3 rounded-full bg-[#16131f] text-white font-bold shadow-xl text-sm"
        >
          ✏️ Edit your page
        </button>
      )}

      {picked && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setPicked(null)}>
          <div className="w-full max-w-md bg-white text-[#16131f] rounded-t-3xl p-5 pb-8 rise" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-wider text-[#6b6780]">{store.creator.displayName}</p>
            <h3 className="text-lg font-bold mt-1">{picked.title}</h3>
            <p className="text-2xl font-extrabold mt-2">{formatINR(picked.price)}</p>
            <p className="text-sm text-[#6b6780] mt-3">
              Checkout isn't switched on for this preview store yet. Your interest has been noted — the creator will see it.
            </p>
            <button onClick={() => setPicked(null)} className="w-full mt-5 py-3.5 rounded-2xl font-bold text-white" style={{ background: t.accent }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function beacon(body: object) {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/track", blob)) {
      fetch("/api/track", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {}
}
