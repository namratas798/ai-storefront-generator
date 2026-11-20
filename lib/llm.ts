import { z } from "zod";

/**
 * Minimal provider layer. Two providers, tried in order:
 *  1. Google Gemini (native REST, JSON mode)
 *  2. Any OpenAI-compatible API (Groq by default) — automatic fallback
 *
 * Every call: timeout → JSON parse → zod validation → custom quality checks.
 * If validation fails we send ONE repair request with the exact errors, then move on to the
 * next provider. The caller only ever receives validated data or a typed failure.
 */

type Msg = { system: string; user: string };
type Provider = { name: string; call: (m: Msg, signal: AbortSignal) => Promise<string> };

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 22000);

function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    list.push({
      name: `gemini:${model}`,
      call: async ({ system, user }, signal) => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.GEMINI_API_KEY!,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.8,
                maxOutputTokens: 4096,
                // Flash models: skip "thinking" to keep latency low for a phone user.
                ...(model.includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
          }
        );
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
        if (!text) throw new Error("Gemini returned no text");
        return text;
      },
    });
  }
  if (process.env.OPENAI_COMPAT_API_KEY) {
    const base = (process.env.OPENAI_COMPAT_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const model = process.env.OPENAI_COMPAT_MODEL || "llama-3.3-70b-versatile";
    list.push({
      name: `openai-compat:${model}`,
      call: async ({ system, user }, signal) => {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_COMPAT_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.8,
            max_tokens: 4096,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error("OpenAI-compatible provider returned no text");
        return text;
      },
    });
  }
  return list;
}

export function hasProvider() {
  return providers().length > 0;
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Response was not JSON");
  }
}

function zodErrors(err: z.ZodError) {
  return err.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export type LlmResult<T> =
  | { ok: true; data: T; provider: string; attempts: number; ms: number }
  | { ok: false; error: string; attempts: number; ms: number };

export async function generateStructured<T>(
  msg: Msg,
  schema: z.ZodType<T>,
  extraChecks: (data: T) => string[] = () => []
): Promise<LlmResult<T>> {
  const started = Date.now();
  const list = providers();
  let attempts = 0;
  let lastError = "No LLM provider configured";

  for (const p of list) {
    let current = msg;
    for (let round = 0; round < 2; round++) {
      attempts++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const raw = await p.call(current, ctrl.signal);
        let json: unknown;
        try {
          json = parseJson(raw);
        } catch {
          lastError = `${p.name}: invalid JSON`;
          current = repair(msg, raw, ["The response was not valid JSON. Return ONLY one JSON object."]);
          continue;
        }
        const parsed = schema.safeParse(json);
        const problems = parsed.success ? extraChecks(parsed.data) : zodErrors(parsed.error);
        if (parsed.success && problems.length === 0) {
          return { ok: true, data: parsed.data, provider: p.name, attempts, ms: Date.now() - started };
        }
        lastError = `${p.name}: ${problems.join("; ")}`;
        // Last round and only quality nits (schema itself passed) → accept rather than fail.
        if (parsed.success && round === 1) {
          return { ok: true, data: parsed.data, provider: p.name, attempts, ms: Date.now() - started };
        }
        current = repair(msg, raw, problems);
      } catch (e) {
        lastError = `${p.name}: ${ctrl.signal.aborted ? "timed out" : (e as Error).message}`;
        break; // network/timeout → go straight to the next provider
      } finally {
        clearTimeout(timer);
      }
    }
    console.warn("[llm] provider failed:", lastError);
  }
  return { ok: false, error: lastError, attempts, ms: Date.now() - started };
}

function repair(original: Msg, badOutput: string, problems: string[]): Msg {
  return {
    system: original.system,
    user:
      original.user +
      `\n\nYour previous answer had these problems:\n- ${problems.join("\n- ")}\n\n` +
      `Previous answer (fix it, keep what was good):\n${badOutput.slice(0, 6000)}\n\nReturn ONLY the corrected JSON object.`,
  };
}
