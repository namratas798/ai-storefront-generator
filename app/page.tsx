"use client";

import { useEffect, useRef, useState } from "react";
import StoreView, { Spinner, type RegenPart } from "@/components/StoreView";
import { AUDIENCE, AUDIENCE_LABEL, THEMES, type Audience, type Language, type Store } from "@/lib/schema";
import { THEME_STYLES } from "@/lib/themes";

type Step = "input" | "generating" | "edit" | "published";
type Input = { handle: string; description: string; audience: Audience | null; language: Language };
type Draft = { step: Step; input: Input; store: Store | null; slug?: string; editKey?: string };

const DRAFT_KEY = "sf_draft_v1";
const OWNED_KEY = "sf_owned_v1";
const EXAMPLES = [
  "Fitness coach helping busy moms lose weight at home",
  "CA who explains income tax & saving in simple Hindi",
  "Home baker in Pune, eggless cakes & cookies",
  "UPSC mentor, cleared prelims twice, teach answer writing",
  "Graphic designer making Canva templates for small brands",
];
const STEPS = ["Understanding your niche", "Picking products your audience will buy", "Pricing for India", "Writing your page"];
const CLIENT_TIMEOUT_MS = 58000;
/** A real, AI-generated store published on this site, shown to people who want to see the result first. */
const EXAMPLE_SLUG = process.env.NEXT_PUBLIC_EXAMPLE_SLUG || "example-creator";

// No follower range pre-selected: creators know their count, and a guess would skew prices.
const emptyInput: Input = { handle: "", description: "", audience: null, language: "english" };

export default function Home() {
  const [draft, setDraft] = useState<Draft>({ step: "input", input: emptyInput, store: null });
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "warn" | "error"; text: string; at?: "followers" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [undo, setUndo] = useState<Store | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  /* ---- persistence: a refresh or a dropped connection never loses work ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d.step === "generating") d.step = d.store ? "edit" : "input";
        setDraft(d);
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, loaded]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setInput = (patch: Partial<Input>) => setDraft((d) => ({ ...d, input: { ...d.input, ...patch } }));

  /* ---- generate the whole store ---- */
  async function generate() {
    const { input } = draft;
    if (!input.handle.trim() && !input.description.trim()) {
      setNotice({ kind: "warn", text: "Add your Instagram handle or a line about what you do." });
      descRef.current?.focus();
      return;
    }
    if (!input.audience) {
      setNotice({ kind: "warn", text: "Pick how many followers you have. It decides your prices.", at: "followers" });
      document.getElementById("followers")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNotice(null);
    const prev = draft.store;
    set({ step: "generating" });
    const res = await call("/api/generate", input);
    if (res.status === "ok") {
      const ig = res.instagram as { status: string; followers: string | null; audienceFromInstagram: boolean };
      const store = res.store as Store;
      if (prev) setUndo(prev);
      set({ step: "edit", store, input: { ...input, audience: store.audience } });
      if (ig.status === "found" && ig.followers)
        setNotice({ kind: "info", text: `Read @${store.handle} — ${ig.followers} followers. Prices are tuned for that.` });
      else if (ig.status === "unavailable" || ig.status === "not_found")
        setNotice({
          kind: "info",
          text:
            ig.status === "not_found"
              ? `We couldn't find @${store.handle} on Instagram, so we built this from your description.`
              : `Instagram didn't let us read @${store.handle} (private or blocked), so we used your description.`,
        });
      else setNotice(null);
      window.scrollTo({ top: 0 });
    } else if (res.status === "needs_input") {
      set({ step: prev ? "edit" : "input" });
      if (!prev) {
        setNotice({ kind: "warn", text: res.message });
        setTimeout(() => descRef.current?.focus(), 50);
      } else setToast(res.message);
    } else {
      set({ step: prev ? "edit" : "input" });
      setNotice({ kind: "error", text: res.message });
    }
  }

  /* ---- regenerate one part ---- */
  async function regenerate(p: RegenPart, instruction?: string) {
    const store = draft.store;
    if (!store) return;
    const key = p.part === "bio" ? "bio" : p.part === "product" ? p.productId : "new_product";
    setBusy(key);
    const res = await call("/api/regenerate", { store, ...p, instruction });
    setBusy(null);
    if (res.status !== "ok") return setToast(res.message || "Couldn't regenerate — kept your version.");
    setUndo(store);
    setDraft((d) => {
      if (!d.store) return d;
      let s = d.store;
      if (p.part === "bio") s = { ...s, creator: res.creator };
      else if (p.part === "product")
        s = {
          ...s,
          products: s.products.map((x) =>
            x.id === p.productId
              ? { ...res.product, delivery: res.product.format === x.format ? x.delivery : undefined }
              : x
          ),
        };
      else s = { ...s, products: [...s.products, res.product].slice(0, 4) };
      return { ...d, store: s };
    });
    setToast(p.part === "new_product" ? "Added a new product" : "Updated");
  }

  /* ---- publish ---- */
  async function publish() {
    if (!draft.store) return;
    setBusy("publish");
    const res = await call("/api/publish", { store: draft.store, slug: draft.slug, editKey: draft.editKey });
    setBusy(null);
    if (res.status !== "ok") return setToast(res.message);
    try {
      const owned = JSON.parse(localStorage.getItem(OWNED_KEY) || "{}");
      owned[res.slug] = res.editKey;
      localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
    } catch {}
    set({ step: "published", slug: res.slug, editKey: res.editKey });
    window.scrollTo({ top: 0 });
  }

  function startOver() {
    setDraft({ step: "input", input: emptyInput, store: null });
    setNotice(null);
    setUndo(null);
  }

  if (!loaded) return <div className="min-h-dvh" />;

  return (
    // Phone-first, responsive like SuperProfile's own pages: on laptops each screen reflows into
    // columns instead of being shrunk into a phone-width strip.
    <div className="lg:min-h-dvh lg:bg-[linear-gradient(135deg,#f1ecff_0%,#f7f6fb_45%,#fff3ea_100%)]">
    {draft.step === "input" && <DesktopTopBar />}
    <div className={draft.step === "input" ? "lg:max-w-6xl lg:mx-auto lg:px-10 lg:pt-6 lg:pb-16 lg:flex lg:items-start lg:justify-between lg:gap-16" : ""}>
    <main
      className={`mx-auto w-full max-w-md min-h-dvh bg-white shadow-[0_0_40px_rgba(0,0,0,0.04)] relative ${
        draft.step === "input"
          ? "lg:mx-0 lg:max-w-xl lg:min-h-0 lg:bg-transparent lg:shadow-none"
          : draft.step === "edit"
            ? "lg:max-w-none lg:shadow-none"
            : "lg:max-w-3xl lg:min-h-0 lg:my-10 lg:rounded-3xl lg:shadow-xl"
      }`}
    >
      {draft.step === "input" && (
        <InputScreen
          input={draft.input}
          setInput={setInput}
          onSubmit={generate}
          notice={notice}
          descRef={descRef}
          hasDraft={!!draft.store}
          onResume={() => set({ step: "edit" })}
          onPickAudience={() => setNotice((n) => (n?.at === "followers" ? null : n))}
        />
      )}
      {draft.step === "generating" && <Generating />}
      {draft.step === "edit" && draft.store && (
        <>
          <EditorHeader
            store={draft.store}
            onTheme={(theme) => set({ store: { ...draft.store!, theme } })}
            onBack={() => {
              set({ step: "input" });
              window.scrollTo({ top: 0 });
            }}
            published={!!draft.slug}
            actions={
              <div className="hidden lg:flex gap-2 ml-2">
                <button
                  onClick={() => setConfirmAll(true)}
                  disabled={!!busy}
                  className="px-4 py-2.5 rounded-xl font-bold border border-[var(--line)] bg-white text-sm disabled:opacity-50"
                >
                  ↻ Redo all
                </button>
                <button
                  onClick={publish}
                  disabled={!!busy}
                  className="px-5 py-2.5 rounded-xl font-bold text-white bg-[var(--brand)] text-sm disabled:opacity-60"
                >
                  {busy === "publish" ? <Spinner /> : draft.slug ? "Update my page" : "Publish my page →"}
                </button>
              </div>
            }
          />
          {/* Toolbar spans the window; the page itself stays at a readable width. */}
          <div className="lg:max-w-[1200px] lg:mx-auto">
          {notice && <Banner notice={notice} onClose={() => setNotice(null)} onRetry={notice.kind === "error" ? generate : undefined} />}
          {draft.store.assumptions.length > 0 && (
            <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-900">
              <b>We filled in a few gaps:</b>
              <ul className="list-disc ml-4 mt-1">
                {draft.store.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <span className="block mt-1">Tap any text below to fix it.</span>
            </div>
          )}
          <p className="text-center text-[12px] text-[var(--soft)] mt-3 mb-1">
            ✏️ Tap any text to edit · ↻ to get a new version
            <span className="hidden lg:inline"> · This is how buyers see your page on a laptop; on a phone it stacks into one column.</span>
          </p>
          <div className="mx-3 lg:mx-6 rounded-3xl overflow-clip border border-[var(--line)]">
            <StoreView
              store={draft.store}
              edit={{ onChange: (s) => set({ store: s }), onRegenerate: regenerate, busy }}
            />
          </div>
          <div className="h-28 lg:h-10" />
          </div>
          <BottomBar hideOnDesktop>
            <button
              onClick={() => setConfirmAll(true)}
              disabled={!!busy}
              className="px-4 py-3.5 rounded-2xl font-bold border border-[var(--line)] bg-white disabled:opacity-50"
            >
              ↻ Redo all
            </button>
            <button
              onClick={publish}
              disabled={!!busy}
              className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-[var(--brand)] disabled:opacity-60"
            >
              {busy === "publish" ? <Spinner /> : draft.slug ? "Update my page" : "Publish my page →"}
            </button>
          </BottomBar>
        </>
      )}
      {draft.step === "published" && draft.store && draft.slug && (
        <Published
          slug={draft.slug}
          editKey={draft.editKey!}
          store={draft.store}
          onEdit={() => set({ step: "edit" })}
          onNew={startOver}
        />
      )}

      {confirmAll && (
        <Sheet onClose={() => setConfirmAll(false)}>
          <h3 className="text-lg font-bold">Start fresh with new ideas?</h3>
          <p className="text-sm text-[var(--soft)] mt-1">This replaces the whole page, including your edits. You can undo right after.</p>
          <div className="flex gap-2 mt-4">
            <button className="flex-1 py-3 rounded-xl border font-semibold" onClick={() => setConfirmAll(false)}>
              Keep editing
            </button>
            <button
              className="flex-1 py-3 rounded-xl bg-[var(--brand)] text-white font-bold"
              onClick={() => {
                setConfirmAll(false);
                generate();
              }}
            >
              Regenerate
            </button>
          </div>
        </Sheet>
      )}

      {toast && draft.step === "edit" && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[#16131f] text-white text-sm rounded-full pl-4 pr-2 py-2 flex items-center gap-3 shadow-lg rise">
          {toast}
          {undo && (
            <button
              className="px-3 py-1 rounded-full bg-white/15 font-semibold"
              onClick={() => {
                set({ store: undo });
                setUndo(null);
                setToast("Restored previous version");
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </main>
    {draft.step === "input" && <DesktopShowcase />}
    </div>
    </div>
  );
}

/** Laptop-only right column: the result next to the form, so a reviewer sees both at a glance. */
function DesktopShowcase() {
  // "loading" → "ready", or "failed" if the example hasn't loaded after 8 s. Never a blank white box.
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <aside className="hidden lg:flex flex-col items-center sticky top-10 w-[340px] shrink-0" aria-label="Example store">
      <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--soft)]">What you get</p>
      <div className="mt-3 w-[300px] h-[600px] rounded-[44px] bg-[#16131f] p-[10px] shadow-2xl">
        <div className="w-full h-full rounded-[34px] overflow-hidden bg-white relative">
          {state !== "ready" && (
            <div className="absolute inset-0 p-5 flex flex-col gap-3" aria-hidden={state === "loading"}>
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-14 w-14 -mt-9 ml-3" style={{ borderRadius: 9999 }} />
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
              <div className="skeleton h-32 w-full mt-3" />
              {state === "failed" && (
                <a
                  href={`/${EXAMPLE_SLUG}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 text-center text-[13px] font-semibold text-[var(--brand)]"
                >
                  Open the example store →
                </a>
              )}
            </div>
          )}
          <iframe
            src={`/${EXAMPLE_SLUG}`}
            title="Example store made by AI"
            onLoad={() => setState("ready")}
            className={`absolute top-0 left-0 border-0 origin-top-left transition-opacity ${state === "ready" ? "opacity-100" : "opacity-0"}`}
            style={{ width: 390, height: 754, transform: "scale(0.718)" }}
          />
        </div>
      </div>
      <ol className="mt-6 w-full space-y-3 text-[14px]">
        {[
          ["Describe yourself", "One line about what you do."],
          ["Get your store", "A bio and 2–4 products, priced for your audience."],
          ["Edit and share", "One link for WhatsApp and Instagram."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-[var(--brand)] text-white text-[13px] font-bold">
              {i + 1}
            </span>
            <span className="leading-snug">
              <b>{title}</b>
              <span className="block text-[var(--soft)]">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/* ================================================================== */

async function call(url: string, body: unknown): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!data) return { status: "error", message: "Something went wrong on our side. Please try again." };
    return data;
  } catch {
    return {
      status: "error",
      message: ctrl.signal.aborted
        ? "That took too long. Your details are saved — tap try again."
        : "Looks like you're offline. Check your connection and try again.",
    };
  } finally {
    clearTimeout(t);
  }
}

function InputScreen({
  input,
  setInput,
  onSubmit,
  notice,
  descRef,
  hasDraft,
  onResume,
  onPickAudience,
}: {
  input: Input;
  setInput: (p: Partial<Input>) => void;
  onSubmit: () => void;
  notice: { kind: "info" | "warn" | "error"; text: string; at?: "followers" } | null;
  descRef: React.RefObject<HTMLTextAreaElement | null>;
  hasDraft: boolean;
  onResume: () => void;
  onPickAudience: () => void;
}) {
  const canSubmit = input.handle.trim() || input.description.trim();
  return (
    <div className="px-5 pt-8 pb-32 lg:pb-8 lg:px-0">
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <div className="inline-flex items-center gap-2 text-[12px] font-bold text-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1 rounded-full">
          ✨ AI Storefront
        </div>
        <a href={`/${EXAMPLE_SLUG}`} className="text-[13px] font-semibold text-[var(--brand)]">
          See an example store →
        </a>
      </div>
      <h1 className="text-[30px] lg:text-[46px] leading-[1.1] font-extrabold mt-4 lg:mt-6 tracking-tight">
        Your store, ready to share in a minute.
      </h1>
      <p className="text-[var(--soft)] mt-3 text-[15px] leading-relaxed">
        Tell us what you do. Get product ideas, prices that work in India and a page you can share, all written for you.
      </p>
      {/* Answers a first-time creator's worries before they type anything. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[12.5px] font-semibold text-[#0e7a55]">
        <span>✓ Free</span>
        <span>✓ No sign-up</span>
        <span>✓ Edit everything</span>
        <span>✓ Live only when you publish</span>
      </div>

      {hasDraft && (
        <button onClick={onResume} className="mt-5 w-full text-left rounded-2xl border border-[var(--line)] p-3 text-sm">
          <b>Continue your last store →</b>
          <span className="block text-[var(--soft)]">Your draft is saved on this phone.</span>
        </button>
      )}

      <form
        className="mt-7 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="What do you teach, make or talk about?" hint="One or two lines is plenty. English, Hindi or Hinglish.">
          <textarea
            ref={descRef}
            value={input.description}
            onChange={(e) => setInput({ description: e.target.value })}
            maxLength={600}
            rows={3}
            placeholder="e.g. I'm a yoga teacher in Jaipur. I help working women fix back pain with 20-min routines."
            className="w-full rounded-2xl border border-[var(--line)] p-3.5 text-[16px] outline-none focus:border-[var(--brand)] focus:ring-4 ring-[var(--brand-soft)] resize-none"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2 -mx-5 px-5 no-scrollbar">
            {EXAMPLES.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setInput({ description: e })}
                className="shrink-0 text-[12.5px] px-3 py-1.5 rounded-full bg-[#f3f1f8] text-[var(--soft)] font-medium"
              >
                {e.length > 34 ? e.slice(0, 32) + "…" : e}
              </button>
            ))}
          </div>
        </Field>

        {notice && notice.at !== "followers" && (
          <Banner notice={notice} inline onRetry={notice.kind === "error" ? onSubmit : undefined} />
        )}

        <Field label="Instagram handle" optional hint="We'll add it to your page and try to read your follower count.">
          <div className="flex items-center rounded-2xl border border-[var(--line)] focus-within:border-[var(--brand)] focus-within:ring-4 ring-[var(--brand-soft)]">
            <span className="pl-3.5 text-[var(--soft)] font-semibold">@</span>
            <input
              value={input.handle}
              onChange={(e) => setInput({ handle: e.target.value.replace(/\s/g, "") })}
              maxLength={80}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="yourhandle"
              className="flex-1 bg-transparent p-3.5 pl-1 text-[16px] outline-none"
            />
          </div>
        </Field>

        <Field label="How many followers do you have?" hint="On your main platform. This decides how we price.">
          {notice?.at === "followers" && (
            <div className="mb-2">
              <Banner notice={notice} inline />
            </div>
          )}
          <div id="followers" className="grid grid-cols-3 gap-2">
            {AUDIENCE.map((a) => (
              <Chip key={a} active={input.audience === a} onClick={() => { setInput({ audience: a }); onPickAudience(); }}>
                {AUDIENCE_LABEL[a]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Page language">
          <div className="grid grid-cols-3 gap-2">
            {(["english", "hinglish", "hindi"] as Language[]).map((l) => (
              <Chip key={l} active={input.language === l} onClick={() => setInput({ language: l })}>
                {l === "english" ? "English" : l === "hinglish" ? "Hinglish" : "हिंदी"}
              </Chip>
            ))}
          </div>
        </Field>

        <BottomBar inlineOnDesktop>
          <button
            type="submit"
            className="w-full py-4 rounded-2xl font-bold text-white text-[16px] bg-[var(--brand)] disabled:opacity-40 shadow-[0_8px_24px_rgba(109,74,255,0.35)]"
            disabled={!canSubmit}
          >
            Build my store ✨
          </button>
        </BottomBar>
      </form>

      {/* How it works: for people arriving cold, e.g. from the link on a published store. */}
      <section className="mt-10 rounded-2xl bg-[#f7f6fb] p-4 lg:hidden" aria-label="How it works">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--soft)]">How it works</h2>
        <ol className="mt-3 space-y-3">
          {[
            ["Describe yourself", "One line about what you teach, make or talk about."],
            ["Get your store", "A bio and 2–4 products, priced for your audience, in seconds."],
            ["Edit and share", "Change anything, then share one link on WhatsApp and Instagram."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-[var(--brand)] text-white text-[13px] font-bold">
                {i + 1}
              </span>
              <span className="text-[14px] leading-snug">
                <b>{title}</b>
                <span className="block text-[var(--soft)]">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <a href={`/${EXAMPLE_SLUG}`} className="inline-block mt-4 text-[13.5px] font-semibold text-[var(--brand)]">
          See what a finished store looks like →
        </a>
      </section>
    </div>
  );
}

function Generating() {
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const a = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 2200);
    const b = setTimeout(() => setSlow(true), 15000);
    return () => {
      clearInterval(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className="px-5 pt-10" aria-live="polite">
      <h2 className="text-2xl font-extrabold">Building your store…</h2>
      <ul className="mt-5 space-y-3">
        {STEPS.map((s, idx) => (
          <li key={s} className={`flex items-center gap-3 text-[15px] ${idx > i ? "text-[#b9b5c8]" : ""}`}>
            <span className="w-6 h-6 grid place-items-center rounded-full text-[12px] font-bold"
              style={{ background: idx < i ? "#0e9f6e" : idx === i ? "var(--brand)" : "#eceaf3", color: idx <= i ? "white" : "#9d99b0" }}>
              {idx < i ? "✓" : idx === i ? <Spinner /> : idx + 1}
            </span>
            {s}
          </li>
        ))}
      </ul>
      {slow && (
        <p className="mt-5 text-sm text-[var(--soft)] rise">Taking a bit longer than usual — still working. Don't close this page.</p>
      )}
      <div className="mt-8 space-y-3">
        <div className="skeleton h-24 w-24 rounded-full" />
        <div className="skeleton h-6 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-40 w-full mt-6" />
        <div className="skeleton h-40 w-full" />
      </div>
    </div>
  );
}

function EditorHeader({
  store,
  onTheme,
  onBack,
  published,
  actions,
}: {
  store: Store;
  onTheme: (t: Store["theme"]) => void;
  onBack: () => void;
  published: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[var(--line)]">
    <div className="px-4 lg:px-6 py-3 flex items-center gap-3 lg:max-w-[1200px] lg:mx-auto">
      <button onClick={onBack} className="text-sm font-semibold text-[var(--soft)]" aria-label="Back to details">
        ← Details
      </button>
      <span className="font-bold text-[15px] flex-1 text-center">{published ? "Edit your page" : "Your draft"}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={store.theme === t}
            aria-label={THEME_STYLES[t].name}
            onClick={() => onTheme(t)}
            className="w-7 h-7 rounded-full border-2"
            style={{ background: THEME_STYLES[t].hero, borderColor: store.theme === t ? "#16131f" : "white", boxShadow: "0 0 0 1px #e8e5f0" }}
          />
        ))}
      </div>
      {actions}
    </div>
    </div>
  );
}

/** Laptop-only top bar on the first screen, so it reads as a web page. */
function DesktopTopBar() {
  return (
    <header className="hidden lg:block border-b border-white/60 bg-white/50 backdrop-blur">
      <div className="max-w-6xl mx-auto px-10 h-16 flex items-center justify-between">
        <span className="font-extrabold text-[17px] tracking-tight">
          ✨ AI Storefront <span className="font-medium text-[var(--soft)] text-[14px]">for Indian creators</span>
        </span>
        <a href={`/${EXAMPLE_SLUG}`} className="text-[14px] font-semibold text-[var(--brand)]">
          See an example store →
        </a>
      </div>
    </header>
  );
}

function Published({
  slug,
  editKey,
  store,
  onEdit,
  onNew,
}: {
  slug: string;
  editKey: string;
  store: Store;
  onEdit: () => void;
  onNew: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [stats, setStats] = useState<{ views: number; clicks: number } | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/${slug}` : `/${slug}`;
  const share = `Check out my new store — ${store.creator.tagline} 👉 ${url}`;
  const missing = store.products.filter((p) => !p.delivery?.trim()).length;

  async function loadStats() {
    const r = await fetch(`/api/stats?slug=${slug}&key=${editKey}`).then((r) => r.json()).catch(() => null);
    if (r?.status === "ok") setStats({ views: r.views, clicks: r.clicks });
  }
  useEffect(() => {
    loadStats();
  }, []); // eslint-disable-line

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="px-5 pt-10 pb-10 lg:px-10 rise">
      <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white grid place-items-center text-2xl">✓</div>
      <h2 className="text-[28px] lg:text-[34px] font-extrabold mt-4 leading-tight">Your store is live!</h2>
      <p className="text-[var(--soft)] mt-1">Share it where your audience already is.</p>

      {/* Laptops: sharing on the left, reminders and stats on the right */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
      <div>
      <div className="mt-6 rounded-2xl border border-[var(--line)] p-3 flex items-center gap-2">
        <span className="flex-1 truncate font-semibold text-[15px]">{url.replace(/^https?:\/\//, "")}</span>
        <button onClick={() => copy(url, "link")} className="px-3 py-2 rounded-xl bg-[#16131f] text-white text-sm font-bold">
          {copied === "link" ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noreferrer"
          className="py-3.5 rounded-2xl text-center font-bold text-white bg-[#25D366]"
        >
          WhatsApp
        </a>
        <a href={`/${slug}`} target="_blank" rel="noreferrer" className="py-3.5 rounded-2xl text-center font-bold bg-[var(--brand)] text-white">
          View page
        </a>
      </div>
      <button
        onClick={() => copy(url, "bio")}
        className="w-full mt-3 py-3.5 rounded-2xl font-bold border border-[var(--line)]"
      >
        {copied === "bio" ? "Copied — paste it in Instagram → Edit profile → Links" : "Copy link for Instagram bio"}
      </button>
      </div>

      <div>
      {missing > 0 && (
        <div className="mt-6 rounded-2xl bg-[#eef6ff] border border-[#cfe3ff] p-4 text-[13.5px] text-[#173b6b]">
          <b>💡 Next step: add delivery links.</b>{" "}
          {missing === 1 ? "1 product doesn't" : `${missing} products don't`} have one yet. That's fine while you test interest; add{" "}
          {missing === 1 ? "it" : "them"} before you start selling so buyers get what they paid for.
          <button onClick={onEdit} className="block mt-2 font-bold underline underline-offset-2">
            Add delivery links
          </button>
        </div>
      )}

      <div className={`mt-8 rounded-2xl bg-[#f7f6fb] p-4 ${missing > 0 ? "" : "lg:mt-6"}`}>
        <div className="flex items-center justify-between">
          <b className="text-sm">Your page so far</b>
          <button onClick={loadStats} className="text-xs font-semibold text-[var(--brand)]">Refresh</button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Stat label="Page views" value={stats?.views} />
          <Stat label="Buy clicks" value={stats?.clicks} />
        </div>
        <p className="text-xs text-[var(--soft)] mt-3">Tip: put the link in your bio and post a story today. Most first sales come from a story.</p>
      </div>
      </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onEdit} className="flex-1 py-3 rounded-2xl border border-[var(--line)] font-semibold">
          Edit page
        </button>
        <button onClick={onNew} className="flex-1 py-3 rounded-2xl border border-[var(--line)] font-semibold text-[var(--soft)]">
          New store
        </button>
      </div>
    </div>
  );
}

/* ---------- small UI bits ---------- */

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-2xl font-extrabold">{value ?? "–"}</div>
      <div className="text-xs text-[var(--soft)]">{label}</div>
    </div>
  );
}

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-bold text-[15px] mb-2">
        {label} {optional && <span className="text-[var(--soft)] font-medium text-[13px]">(optional)</span>}
      </span>
      {children}
      {hint && <span className="block text-[12.5px] text-[var(--soft)] mt-1.5">{hint}</span>}
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-2.5 rounded-xl text-[13.5px] font-semibold border transition ${
        active ? "bg-[var(--brand)] text-white border-[var(--brand)]" : "bg-white border-[var(--line)]"
      }`}
    >
      {children}
    </button>
  );
}

function Banner({
  notice,
  onClose,
  inline,
  onRetry,
}: {
  notice: { kind: "info" | "warn" | "error"; text: string; at?: "followers" };
  onClose?: () => void;
  inline?: boolean;
  onRetry?: () => void;
}) {
  const styles = {
    info: "bg-[#eef6ff] border-[#cfe3ff] text-[#173b6b]",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-rose-50 border-rose-200 text-rose-900",
  }[notice.kind];
  return (
    <div role={notice.kind === "info" ? "status" : "alert"} className={`${inline ? "" : "mx-4 mt-3"} rounded-xl border p-3 text-[13.5px] flex gap-2 rise ${styles}`}>
      <span className="flex-1">{notice.text}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2">
          Try again
        </button>
      )}
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="font-bold opacity-60">
          ×
        </button>
      )}
    </div>
  );
}

function BottomBar({
  children,
  inlineOnDesktop,
  hideOnDesktop,
}: {
  children: React.ReactNode;
  inlineOnDesktop?: boolean;
  hideOnDesktop?: boolean;
}) {
  return (
    <div
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 bg-white/95 backdrop-blur border-t border-[var(--line)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex gap-3 ${
        inlineOnDesktop ? "lg:static lg:translate-x-0 lg:max-w-none lg:bg-transparent lg:border-0 lg:p-0 lg:mt-2" : ""
      } ${hideOnDesktop ? "lg:hidden" : ""}`}
    >
      {children}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 rise" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
