# AI Storefront Generator

Turns a creator's one-line description (and optional Instagram handle) into a ready-to-share
storefront: an AI-written bio, 2–4 product ideas with India-appropriate INR pricing, a description
for each product, and a public page at a short link that works well on a phone and on a laptop.

Built as the SuperProfile PM take-home (AI Storefront Generator).

**Live:** https://ai-storefront-generator-pi.vercel.app
· **Example store:** https://ai-storefront-generator-pi.vercel.app/example-creator
· **AI status:** https://ai-storefront-generator-pi.vercel.app/api/health
· **Walkthrough:** `<Loom link>`

## How it works (30 seconds)

1. **Input:** one line about what you teach, make or talk about, plus an optional Instagram handle,
   your follower range (Under 1K · 1K–5K · 5K–20K · 20K–100K · 100K+, nothing pre-selected) and the
   page language (English by default, Hinglish or हिंदी).
2. **Generate (2–4 s):** one LLM call returns structured JSON. It is validated with Zod, then checked
   in code: distinct formats, an entry product at ₹599 or less, no risky claims ("guaranteed
   returns", cures) and no invented credentials ("certified", "10+ years", "500+ students"). Anything
   that fails is sent back once with the exact errors. If a provider is slow or down, the next one
   is tried: Groq first, Gemini as fallback.
3. **Price guardrails:** every price is clamped to an INR band for its format and the creator's
   follower range, then snapped to a familiar price (₹149, ₹349, ₹999, ₹1,999).
4. **Edit:** the draft *is* the page. Tap any text to edit it. Each block has **New version**,
   **Tweak** (Shorter / More premium / More friendly / In Hinglish / your own instruction) and
   **Remove**, with Undo after any regeneration. "Why ₹X?" explains the AI's suggested price, even
   after you change it. Each product has a private **delivery link** (Drive file, Calendly, Zoom,
   WhatsApp group) that buyers would get only after paying.
5. **Publish:** a short link (`/yourhandle`), WhatsApp share, copy-for-Instagram-bio, and view and
   buy-click counts. The Buy button logs interest instead of taking payment.

**Messy input never breaks the page:** empty input, gibberish, an invalid or unreadable handle and a
one-word description each get a friendly next step, and a failed AI call keeps everything you typed.

**Phone-first, responsive on laptops:** one column on phones; on laptops the store reflows into two
columns (profile pinned, products in a grid), like SuperProfile's own pages.

## Run locally

```bash
npm install
cp .env.example .env.local   # add at least one LLM key
npm run dev                  # http://localhost:3000
```

Without Redis env vars, published pages are kept in memory, which is fine for local use.

## Deploy (Vercel, about 5 minutes)

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it.
2. **Storage → Marketplace → Upstash (Redis)**: create a free database, connect it to the project
   with the prefix `KV`. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Settings → Environment Variables**: add `OPENAI_COMPAT_API_KEY` (free Groq key at
   console.groq.com/keys) and, as a fallback, `GEMINI_API_KEY` (free at aistudio.google.com/apikey).
4. Redeploy, open `/api/health` to check both AI providers, then open the site on your phone.
5. Optional: publish a sample store at `/example-creator` so the "See an example store" links work.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_COMPAT_API_KEY` | one of the two | Primary when set (fastest). Any OpenAI-compatible API; defaults to Groq `openai/gpt-oss-120b` |
| `GEMINI_API_KEY` | one of the two | Fallback. `GEMINI_MODEL` defaults to `gemini-3.6-flash`, then `gemini-flash-latest`, then `gemini-3.8-flash` |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL` | no | Point at OpenAI, OpenRouter and so on |
| `AI_PRIMARY` | no | `gemini` puts Gemini first instead of Groq |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | on Vercel | Upstash Redis for published pages and counters |
| `LLM_TIMEOUT_MS`, `LLM_BUDGET_MS` | no | Per-attempt timeout (28000) and total AI time budget (50000) |
| `NEXT_PUBLIC_EXAMPLE_SLUG` | no | Slug of the example store (default `example-creator`) |
| `DISABLE_INSTAGRAM` | no | `1` skips the best-effort Instagram read |

No keys are committed. `.env*` is git-ignored.

## Project map

```
app/page.tsx              Creator flow: input → generating → editor → published
app/[slug]/page.tsx       Public store page (server-rendered; strips edit key and delivery links)
app/api/generate          Input checks → Instagram read → LLM → validate → price guardrails
app/api/regenerate        Regenerate bio / one product / add a product (optional instruction)
app/api/publish           Create or update a page (edit key, no login)
app/api/store             Owner-only full store (with delivery links) for editing
app/api/track, stats      View and buy-click counters
app/api/health            Live check of each AI provider (no keys or prompts returned)
components/StoreView.tsx  ONE renderer for the editor and the public page; adapts to its width
lib/llm.ts                Providers, timeouts, retries, JSON parse, Zod validation, repair, fallback
lib/prompts.ts            System and user prompts (today's date and Indian FY included)
lib/pricing.ts            INR price bands per format × follower range
lib/quality.ts            Gibberish check, handle parsing, risky and invented-claim checks
lib/instagram.ts          Best-effort public profile meta read (never required)
```

## Stack and tools

Next.js 16 (App Router), React 19, Tailwind 4, Zod 4, Upstash Redis, Vercel. Groq gpt-oss-120b,
with Gemini Flash as fallback. Built with Claude Code as the pair programmer: scaffolding,
components, edge-case test scripts and phone and laptop screenshot checks with Playwright.
