# AI Storefront Generator

Turns a creator's Instagram handle or a one-line description into a ready-to-share storefront:
an AI-written bio, 2–4 product ideas with India-appropriate INR pricing, a description for each
product, and a public, mobile-first page at a short link.

**Live:** `<your Vercel URL>` · **Decision doc:** `<link>` · **Walkthrough:** `<Loom link>`

## How it works (30 seconds)

1. **Input**: a one-line description (primary), plus an optional Instagram handle, follower range and language (English / Hinglish / हिंदी).
2. **Generate**: one LLM call returns **structured JSON**. It is validated with Zod, checked for quality (distinct formats, an entry product at ₹599 or less, no "guaranteed returns" or cure claims) and repaired once if needed. If a provider fails, the next one is tried (Groq first, then Gemini).
3. **Price guardrails**: every price is clamped to a per-format INR band for the creator's audience size, then snapped to a familiar price (₹349, ₹999, ₹1,999).
4. **Edit**: the draft *is* the page. Tap any text to edit it. Each block has **New version**, **Tweak** (Shorter / More premium / In Hinglish / free text) and **Remove**. Undo works after any regeneration.
5. **Publish**: you get a short link (`/yourhandle`), WhatsApp share, copy-for-Instagram-bio, and view and buy-click counts.

## Run locally

```bash
npm install
cp .env.example .env.local   # add at least one LLM key
npm run dev                  # http://localhost:3000
```

Without Redis env vars, published pages are kept in memory, which is fine for local use.

## Deploy (Vercel, about 5 minutes)

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it.
2. **Storage → Marketplace → Upstash (Redis)**: create a free database and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Settings → Environment Variables**: add `OPENAI_COMPAT_API_KEY` (free Groq key at console.groq.com/keys) and, as a fallback, `GEMINI_API_KEY` (free at aistudio.google.com/apikey).
4. Redeploy. Open the URL on your phone.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | one of the two | Fallback provider (`GEMINI_MODEL`, default `gemini-3.6-flash`, falls back to `gemini-flash-latest` then `gemini-3.8-flash`) |
| `OPENAI_COMPAT_API_KEY` | one of the two | Primary when set (fastest); any OpenAI-compatible API. Defaults to Groq `openai/gpt-oss-120b` |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL` | no | Point at OpenAI, OpenRouter and so on |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | on Vercel | Upstash Redis for published pages and counters |
| `LLM_TIMEOUT_MS`, `LLM_BUDGET_MS` | no | Per-attempt timeout (28000) and total AI time budget (50000) |
| `DISABLE_INSTAGRAM` | no | `1` skips the best-effort Instagram read |

No keys are committed. `.env*` is git-ignored.

## Project map

```
app/page.tsx              Creator flow: input → generating → editor → published
app/[slug]/page.tsx       Public store page (server-rendered, OG tags for WhatsApp previews)
app/api/generate          Input checks → Instagram read → LLM → validate → price guardrails
app/api/regenerate        Regenerate bio / one product / add a product (optional instruction)
app/api/publish           Create or update a page (edit key, no login)
app/api/track, stats      View and buy-click counters
components/StoreView.tsx  ONE renderer used by both the editor and the public page
lib/llm.ts                Providers, timeout, JSON parse, Zod validation, repair, fallback
lib/prompts.ts            System and user prompts
lib/pricing.ts            INR price bands per format × audience size
lib/quality.ts            Gibberish check, handle parsing, risky-claim checks, post-processing
lib/instagram.ts          Best-effort public profile meta read (never required)
```

## Stack and tools

Next.js 16 (App Router), React 19, Tailwind 4, Zod 4, Upstash Redis. Groq gpt-oss-120b, with Gemini Flash as fallback. Built with Claude Code as the pair programmer: scaffolding, components, edge-case test scripts and mobile screenshot checks with Playwright.
