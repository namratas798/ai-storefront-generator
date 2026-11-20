import { Redis } from "@upstash/redis";
import type { Store } from "./schema";

/**
 * Persistence for published pages + simple counters.
 * Upstash Redis in production (Vercel Marketplace sets KV_REST_API_URL / KV_REST_API_TOKEN).
 * Falls back to an in-memory map for local development.
 */
export type Published = Store & { slug: string; editKey: string; publishedAt: number; updatedAt: number };

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const g = globalThis as unknown as { __mem?: Map<string, unknown> };
const mem = (g.__mem ??= new Map<string, unknown>());

export const storageMode = redis ? "redis" : "memory";

async function get<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  return (mem.get(key) as T) ?? null;
}
async function set(key: string, value: unknown) {
  if (redis) await redis.set(key, value);
  else mem.set(key, value);
}
async function incr(key: string) {
  if (redis) return redis.incr(key);
  const n = ((mem.get(key) as number) || 0) + 1;
  mem.set(key, n);
  return n;
}

export async function getStore(slug: string) {
  return get<Published>(`store:${slug}`);
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "store"
  );
}

const RESERVED = new Set(["api", "s", "edit", "new", "admin", "_next", "favicon-ico", "store"]);

export async function uniqueSlug(base: string) {
  let slug = slugify(base);
  if (RESERVED.has(slug)) slug = `${slug}-store`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    if (!(await get(`store:${candidate}`))) return candidate;
  }
  return `${slug}-${crypto.randomUUID().slice(0, 4)}`;
}

export async function saveStore(p: Published) {
  await set(`store:${p.slug}`, p);
}

export async function track(slug: string, event: "view" | "click", productId?: string) {
  await incr(`stats:${slug}:${event}`);
  if (event === "click" && productId) await incr(`stats:${slug}:click:${productId}`);
}

export async function getStats(slug: string, productIds: string[]) {
  const [views, clicks, ...per] = await Promise.all([
    get<number>(`stats:${slug}:view`),
    get<number>(`stats:${slug}:click`),
    ...productIds.map((id) => get<number>(`stats:${slug}:click:${id}`)),
  ]);
  return {
    views: Number(views) || 0,
    clicks: Number(clicks) || 0,
    perProduct: Object.fromEntries(productIds.map((id, i) => [id, Number(per[i]) || 0])),
  };
}
