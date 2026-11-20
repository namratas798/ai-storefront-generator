import { NextResponse } from "next/server";
import { GenerateInput, LlmStore, type Store } from "@/lib/schema";
import { normalizeHandle, looksLikeGibberish, qualityIssues, finalizeProducts } from "@/lib/quality";
import { readInstagram, audienceFromFollowers } from "@/lib/instagram";
import { generateStructured, hasProvider } from "@/lib/llm";
import { SYSTEM, storePrompt } from "@/lib/prompts";

export const maxDuration = 60;

type NeedsInput = { status: "needs_input"; reason: string; message: string };

export async function POST(req: Request) {
  const body = GenerateInput.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return needs("bad_request", "Something about that input didn't look right. Try again?");
  const { description, language } = body.data;
  let { audience } = body.data;
  const desc = description.trim();
  const { handle, valid } = normalizeHandle(body.data.handle);

  if (!handle && !desc) return needs("empty", "Add your Instagram handle or tell us in a line what you do.");
  if (handle && !valid && !desc)
    return needs("invalid_handle", `"${body.data.handle}" doesn't look like an Instagram handle. Tell us what you do instead?`);
  if (desc && looksLikeGibberish(desc) && !handle)
    return needs("gibberish", "Hmm, we couldn't make sense of that. What do you teach, make or talk about?");

  if (!hasProvider()) {
    return NextResponse.json(
      { status: "error", message: "The AI isn't configured on this server yet (missing API key)." },
      { status: 503 }
    );
  }

  // Best-effort Instagram read (≤3.5s). The flow never depends on it.
  const ig = valid && handle ? await readInstagram(handle) : { status: "skipped" as const, profile: null };
  if (ig.status === "not_found" && !desc)
    return needs("handle_not_found", `We couldn't find @${handle} on Instagram. Check the spelling, or just tell us what you do.`);
  const igAudience = audienceFromFollowers(ig.profile?.followers);
  if (igAudience) audience = igAudience;

  const result = await generateStructured(
    {
      system: SYSTEM,
      user: storePrompt({
        handle: valid ? handle : "",
        description: desc || (valid ? `(Only an Instagram handle was given: @${handle})` : ""),
        audience,
        language,
        ig: ig.profile,
      }),
    },
    LlmStore,
    (data) => qualityIssues(data, `${desc} ${ig.profile?.bio ?? ""}`)
  );

  if (!result.ok) {
    console.error("[generate] failed", result);
    return NextResponse.json(
      { status: "error", message: "Our AI is taking a breather. Your details are saved — tap Try again." },
      { status: 503 }
    );
  }

  const data = result.data;
  if (data.inputQuality === "gibberish") {
    if (!desc)
      return needs(
        "handle_unreadable",
        `We couldn't tell what @${handle} is about from the handle alone. Tell us in a line what you teach, make or talk about.`
      );
    return needs("gibberish", data.clarifyingQuestion || "We need a little more to go on. What do you teach, make or talk about?");
  }

  const store: Store = {
    handle: valid ? handle : "",
    audience,
    language,
    theme: data.theme,
    creator: data.creator!,
    products: finalizeProducts(data.products, audience).sort((a, b) => a.price - b.price), // ladder: entry product first
    assumptions: data.inputQuality === "vague" ? (data.assumptions ?? []).slice(0, 3) : [],
  };

  return NextResponse.json({
    status: "ok",
    store,
    instagram: { status: ig.status, followers: ig.profile?.followers ?? null, audienceFromInstagram: !!igAudience },
    meta: { provider: result.provider, attempts: result.attempts, ms: result.ms },
  });
}

function needs(reason: string, message: string) {
  return NextResponse.json({ status: "needs_input", reason, message } satisfies NeedsInput);
}
