import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, providerNames } from "@/lib/llm";
import { storageMode } from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Diagnostics: sends a tiny prompt to each configured AI provider on its own and reports
 * whether it answered and how fast. Never returns keys or prompts.
 */
export async function GET() {
  const names = providerNames();
  const results = await Promise.all(
    names.map(async (name) => {
      const r = await generateStructured(
        { system: "Reply with JSON only.", user: 'Return {"ok": true}' },
        z.object({ ok: z.boolean() }),
        undefined,
        { only: name, budgetMs: 25000 }
      );
      return r.ok
        ? { provider: name, ok: true, ms: r.ms }
        : { provider: name, ok: false, ms: r.ms, error: r.error.replace(/AIza[\w-]+|AQ\.[\w.-]+|gsk_[\w]+/g, "[key]").slice(0, 300) };
    })
  );
  return NextResponse.json({ storage: storageMode, providers: results });
}
