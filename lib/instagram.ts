/**
 * Best-effort, single-page read of a PUBLIC Instagram profile's meta tags.
 * No login, no API, no crawling. Instagram often returns a login wall to server IPs, so the
 * product is designed to work fully WITHOUT this: the creator's description is the primary
 * signal and this only adds follower count / bio when it happens to be available.
 */
export type IgProfile = { fullName?: string; followers?: string; bio?: string };
export type IgStatus = "skipped" | "found" | "not_found" | "unavailable" | "invalid";

export async function readInstagram(handle: string): Promise<{ status: IgStatus; profile: IgProfile | null }> {
  if (!handle) return { status: "skipped", profile: null };
  if (process.env.DISABLE_INSTAGRAM === "1") return { status: "unavailable", profile: null };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });
    if (res.status === 404) return { status: "not_found", profile: null };
    if (!res.ok) return { status: "unavailable", profile: null };
    const html = await res.text();
    const og = meta(html, "og:description");
    const title = meta(html, "og:title");
    if (!og) {
      if (/Page Not Found|isn.t available/i.test(html)) return { status: "not_found", profile: null };
      return { status: "unavailable", profile: null };
    }
    // "12.3K Followers, 210 Following, 340 Posts - See Instagram photos and videos from Name (@handle)"
    const followers = og.match(/([\d.,]+[KMkm]?)\s+Followers/)?.[1];
    const fullName = title?.replace(/\s*\(@.*$/, "").trim() || undefined;
    const desc = meta(html, "description");
    const bio = desc?.includes(":") ? desc.split(":").slice(1).join(":").replace(/^\s*"|"\s*$/g, "").trim() : undefined;
    return { status: "found", profile: { fullName, followers, bio: bio?.slice(0, 300) } };
  } catch {
    return { status: "unavailable", profile: null };
  } finally {
    clearTimeout(t);
  }
}

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1]) : undefined;
}

function decode(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Map a follower string like "12.3K" to our audience bucket. */
export function audienceFromFollowers(f?: string) {
  if (!f) return null;
  const m = f.replace(/,/g, "").match(/([\d.]+)([KMkm]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2].toLowerCase() === "k" ? 1e3 : m[2].toLowerCase() === "m" ? 1e6 : 1);
  if (n < 5000) return "under_5k" as const;
  if (n < 20000) return "5k_20k" as const;
  if (n < 100000) return "20k_100k" as const;
  return "over_100k" as const;
}
