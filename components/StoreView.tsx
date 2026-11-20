"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FORMAT_LABEL, type Product, type Store } from "@/lib/schema";
import { THEME_STYLES } from "@/lib/themes";
import { PRICE_BANDS, formatINR, priceRange } from "@/lib/pricing";

/* ------------------------------------------------------------------ */
/* One renderer for both the editor and the public page.               */
/* In edit mode every text is tappable, and each block gets controls.  */
/* ------------------------------------------------------------------ */

export type RegenPart = { part: "bio" } | { part: "product"; productId: string } | { part: "new_product" };

type EditProps = {
  onChange: (s: Store) => void;
  onRegenerate: (p: RegenPart, instruction?: string) => void;
  busy: string | null; // "bio" | productId | "new_product" | "all"
};

type Props = {
  store: Store;
  edit?: EditProps;
  onBuy?: (p: Product) => void;
};

const TWEAKS = ["Shorter", "More premium", "More friendly", "In Hinglish"];

/** What the creator hands over after a sale, worded per format. */
const DELIVERY: Record<Product["format"], { label: string; placeholder: string }> = {
  ebook: { label: "Link to your e-book", placeholder: "Google Drive or Dropbox link to the PDF" },
  template_pack: { label: "Link to your templates", placeholder: "Canva, Notion or Google Drive link" },
  recorded_course: { label: "Link to your course videos", placeholder: "Unlisted YouTube playlist or Drive folder" },
  cohort_course: { label: "Joining link for the cohort", placeholder: "WhatsApp group invite or Zoom/Meet link" },
  workshop: { label: "Joining link for the workshop", placeholder: "Zoom or Google Meet link" },
  one_on_one: { label: "How buyers book the call", placeholder: "Calendly / Cal.com link or WhatsApp number" },
  community: { label: "Invite link to your community", placeholder: "WhatsApp or Telegram group invite link" },
};

/** A web link, or a phone number (for WhatsApp bookings). */
export function isDeliveryValue(v: string) {
  const s = v.trim();
  if (/^\+?[\d\s-]{10,15}$/.test(s)) return true;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

export default function StoreView({ store, edit, onBuy }: Props) {
  const t = THEME_STYLES[store.theme];
  const c = store.creator;
  const initials = c.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const setCreator = (k: keyof Store["creator"], v: string) =>
    edit?.onChange({ ...store, creator: { ...store.creator, [k]: v } });
  const setProduct = (id: string, patch: Partial<Product>) =>
    edit?.onChange({ ...store, products: store.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  return (
    <div style={{ background: t.bg, color: t.text }} className="min-h-full pb-6">
      {/* Hero */}
      <div style={{ background: t.hero }} className="h-28 w-full" />
      <div className="px-5 -mt-12">
        <div
          className="w-24 h-24 rounded-full grid place-items-center text-3xl font-bold shadow-lg border-4"
          style={{ background: t.card, color: t.accent, borderColor: t.bg }}
          aria-hidden
        >
          {initials || "★"}
        </div>

        <Block
          edit={edit}
          busyKey="bio"
          label="profile"
          onRegen={(i) => edit?.onRegenerate({ part: "bio" }, i)}
          muted={t.muted}
        >
          <Text
            edit={!!edit}
            value={c.displayName}
            onChange={(v) => setCreator("displayName", v)}
            className="text-[26px] font-extrabold leading-tight mt-3"
            maxLength={60}
            placeholder="Your name"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: t.chip }}>
              <Text edit={!!edit} value={c.niche} onChange={(v) => setCreator("niche", v)} maxLength={60} inline />
            </span>
            {store.handle && (
              <a
                href={`https://instagram.com/${store.handle}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: t.muted }}
              >
                @{store.handle}
              </a>
            )}
          </div>
          <Text
            edit={!!edit}
            value={c.tagline}
            onChange={(v) => setCreator("tagline", v)}
            className="text-lg font-semibold mt-4 leading-snug"
            maxLength={120}
          />
          <Text
            edit={!!edit}
            value={c.bio}
            onChange={(v) => setCreator("bio", v)}
            className="mt-2 text-[15px] leading-relaxed"
            style={{ color: t.muted }}
            maxLength={600}
          />
        </Block>
      </div>

      {/* Products */}
      <div className="px-4 mt-7 space-y-4">
        <h2 className="px-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: t.muted }}>
          {store.language === "hindi" ? "मेरे प्रोडक्ट्स" : store.language === "hinglish" ? "Mere products" : "Work with me"}
        </h2>
        {store.products.map((p, idx) => (
          <ProductCard
            key={p.id}
            p={p}
            store={store}
            featured={idx === 0}
            edit={edit}
            setProduct={setProduct}
            onBuy={onBuy}
          />
        ))}

        {edit && store.products.length < 4 && (
          <button
            onClick={() => edit.onRegenerate({ part: "new_product" })}
            disabled={!!edit.busy}
            className="w-full rounded-2xl border-2 border-dashed py-4 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: t.muted + "66", color: t.muted }}
          >
            {edit.busy === "new_product" ? <Spinner /> : "+ Suggest another product"}
          </button>
        )}
      </div>

      <p className="text-center text-xs mt-8" style={{ color: t.muted }}>
        Secure payments via UPI & cards · Instant access after purchase
      </p>
    </div>
  );
}

function ProductCard({
  p,
  store,
  featured,
  edit,
  setProduct,
  onBuy,
}: {
  p: Product;
  store: Store;
  featured: boolean;
  edit?: EditProps;
  setProduct: (id: string, patch: Partial<Product>) => void;
  onBuy?: (p: Product) => void;
}) {
  const t = THEME_STYLES[store.theme];
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const range = priceRange(p.format, store.audience);
  const suggested = p.suggestedPrice ?? p.price;
  const deliveryOk = !p.delivery || isDeliveryValue(p.delivery);
  const unit = PRICE_BANDS[p.format].unit ?? "";
  const long = p.description.length > 200;
  const isEdit = !!edit;

  return (
    <div
      className="rounded-2xl p-4 shadow-sm rise relative"
      style={{ background: t.card, border: featured ? `2px solid ${t.accent}` : `1px solid ${t.muted}22` }}
    >
      {featured && (
        <span
          className="absolute -top-3 left-4 text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: t.accent, color: t.accentText }}
        >
          {p.price <= 599 ? "Start here" : "Most popular"}
        </span>
      )}
      <Block
        edit={edit}
        busyKey={p.id}
        label="product"
        onRegen={(i) => edit?.onRegenerate({ part: "product", productId: p.id }, i)}
        onRemove={
          edit && store.products.length > 1
            ? () => edit.onChange({ ...store, products: store.products.filter((x) => x.id !== p.id) })
            : undefined
        }
        muted={t.muted}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style={{ background: t.chip }}>
            {FORMAT_LABEL[p.format]}
          </span>
        </div>
        <Text
          edit={isEdit}
          value={p.title}
          onChange={(v) => setProduct(p.id, { title: v })}
          className="text-[19px] font-bold leading-snug mt-2.5"
          maxLength={100}
          placeholder="Product title"
        />
        {isEdit ? (
          <Text
            edit
            value={p.description}
            onChange={(v) => setProduct(p.id, { description: v })}
            className="text-[14.5px] leading-relaxed mt-2"
            style={{ color: t.muted }}
            maxLength={900}
          />
        ) : (
          <p className="text-[14.5px] leading-relaxed mt-2 whitespace-pre-line" style={{ color: t.muted }}>
            {long && !open ? p.description.slice(0, 190).trimEnd() + "… " : p.description + " "}
            {long && (
              <button onClick={() => setOpen(!open)} className="font-semibold" style={{ color: t.accent }}>
                {open ? "Less" : "Read more"}
              </button>
            )}
          </p>
        )}

        <ul className="mt-3 space-y-1.5 text-sm">
          {p.deliverables.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span style={{ color: t.accent }} className="font-bold">✓</span>
              <Text
                edit={isEdit}
                value={d}
                onChange={(v) =>
                  setProduct(p.id, { deliverables: p.deliverables.map((x, j) => (j === i ? v : x)) })
                }
                maxLength={120}
                className="flex-1"
              />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-3">
          <div className="shrink-0">
            {isEdit ? (
              <label className="flex items-baseline text-2xl font-extrabold">
                ₹
                <input
                  inputMode="numeric"
                  aria-label="Price in rupees"
                  value={p.price ? String(p.price) : ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10);
                    setProduct(p.id, { price: Math.min(n, 200000) });
                  }}
                  className="w-24 bg-transparent outline-none border-b border-dashed ml-0.5"
                  style={{ borderColor: t.muted + "88" }}
                />
                <span className="text-sm font-semibold" style={{ color: t.muted }}>{unit}</span>
              </label>
            ) : (
              <div className="text-2xl font-extrabold">
                {p.price === 0 ? "Free" : formatINR(p.price)}
                <span className="text-sm font-semibold" style={{ color: t.muted }}>{unit}</span>
              </div>
            )}
          </div>
          {isEdit ? (
            <Text
              edit
              value={p.ctaLabel}
              onChange={(v) => setProduct(p.id, { ctaLabel: v })}
              maxLength={30}
              className="flex-1 text-center rounded-xl py-3 font-bold"
              style={{ background: t.accent, color: t.accentText }}
            />
          ) : (
            <button
              onClick={() => onBuy?.(p)}
              className="flex-1 rounded-xl py-3 font-bold active:scale-[0.98] transition"
              style={{ background: t.accent, color: t.accentText }}
            >
              {p.ctaLabel}
            </button>
          )}
        </div>

        {isEdit && (
          <div className="mt-3 text-[13px]">
            {/* The reason explains the AI's suggested price, so the label stays on that price. */}
            <button onClick={() => setWhy(!why)} className="font-semibold underline underline-offset-2" style={{ color: t.accent }}>
              Why {formatINR(suggested)}?
            </button>
            {(p.price < range.min * 0.5 || p.price > range.max * 1.5) && p.price > 0 && (
              <span className="ml-2" style={{ color: "#c2410c" }}>
                ⚠ Unusual for your audience
              </span>
            )}
            {why && (
              <div className="mt-2 rounded-xl p-3 leading-relaxed" style={{ background: t.chip }}>
                {p.priceRationale}
                <div className="mt-1.5 font-semibold">
                  Typical for {FORMAT_LABEL[p.format].toLowerCase()} at your audience size: {formatINR(range.min)}–{formatINR(range.max)}
                  {unit}
                </div>
                {p.price !== suggested && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span>
                      You changed it to <b>{formatINR(p.price)}</b>.
                    </span>
                    <button
                      onClick={() => setProduct(p.id, { price: suggested })}
                      className="px-2.5 py-1 rounded-full font-semibold border"
                      style={{ borderColor: t.muted + "66" }}
                    >
                      Use {formatINR(suggested)}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* What the buyer receives. Kept private: never shown on the public page. */}
            <label className="block mt-4">
              <span className="font-semibold" style={{ color: t.text }}>
                {DELIVERY[p.format].label}
              </span>
              <input
                value={p.delivery ?? ""}
                onChange={(e) => setProduct(p.id, { delivery: e.target.value.slice(0, 500) })}
                placeholder={DELIVERY[p.format].placeholder}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-[14px] outline-none border bg-white text-[#16131f]"
                style={{ borderColor: deliveryOk ? t.muted + "55" : "#c2410c" }}
              />
              <span className="block mt-1.5" style={{ color: !p.delivery ? "#c2410c" : deliveryOk ? t.muted : "#c2410c" }}>
                {!p.delivery
                  ? "⚠ Add this before you start selling. You can publish without it to test demand."
                  : deliveryOk
                    ? "✓ Private. Buyers get this only after they pay."
                    : "This doesn't look like a link or phone number. Check it before you start selling."}
              </span>
            </label>
          </div>
        )}
      </Block>
    </div>
  );
}

/* Wraps a section with Regenerate / Tweak / Remove controls in edit mode. */
function Block({
  edit,
  busyKey,
  label,
  onRegen,
  onRemove,
  muted,
  children,
}: {
  edit?: EditProps;
  busyKey: string;
  label: string;
  onRegen: (instruction?: string) => void;
  onRemove?: () => void;
  muted: string;
  children: React.ReactNode;
}) {
  const [tweak, setTweak] = useState(false);
  const [custom, setCustom] = useState("");
  if (!edit) return <>{children}</>;
  const busy = edit.busy === busyKey || edit.busy === "all";
  const disabled = !!edit.busy;
  const run = (i?: string) => {
    setTweak(false);
    setCustom("");
    onRegen(i);
  };

  return (
    <div className={busy ? "opacity-50 pointer-events-none transition" : "transition"}>
      {children}
      <div className="flex flex-wrap gap-2 mt-3 text-[13px] font-semibold" style={{ color: muted }}>
        <button disabled={disabled} onClick={() => run()} className="px-3 py-1.5 rounded-full border disabled:opacity-40" style={{ borderColor: muted + "55" }}>
          {busy ? <Spinner /> : "↻ New version"}
        </button>
        <button disabled={disabled} onClick={() => setTweak(!tweak)} className="px-3 py-1.5 rounded-full border disabled:opacity-40" style={{ borderColor: muted + "55" }}>
          ✨ Tweak
        </button>
        {onRemove && (
          <button disabled={disabled} onClick={onRemove} className="px-3 py-1.5 rounded-full border disabled:opacity-40 ml-auto" style={{ borderColor: muted + "55" }} aria-label={`Remove ${label}`}>
            Remove
          </button>
        )}
      </div>
      {tweak && (
        <div className="mt-2 flex flex-wrap gap-2 rise">
          {TWEAKS.map((x) => (
            <button key={x} onClick={() => run(x)} className="px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: muted + "22" }}>
              {x}
            </button>
          ))}
          <form
            className="flex w-full gap-2 mt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) run(custom.trim());
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={200}
              placeholder={label === "product" ? "e.g. make it a 4-week program" : "e.g. mention I'm a mom of two"}
              className="flex-1 rounded-xl px-3 py-2 text-sm bg-white text-black border border-black/10 outline-none"
            />
            <button className="px-3 rounded-xl text-sm font-bold bg-black text-white">Go</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Text({
  edit,
  value,
  onChange,
  className = "",
  style,
  maxLength,
  placeholder,
  inline,
}: {
  edit: boolean;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  maxLength?: number;
  placeholder?: string;
  inline?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value, edit]);

  if (!edit) {
    const Tag = inline ? "span" : "p";
    return (
      <Tag className={className + " whitespace-pre-line"} style={style}>
        {value}
      </Tag>
    );
  }
  if (inline) {
    return (
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        size={Math.max(4, value.length)}
        className="bg-transparent outline-none border-b border-dashed border-current/40"
      />
    );
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={"editable block " + className}
      style={style}
    />
  );
}

export function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full spin align-[-3px]" />
  );
}
