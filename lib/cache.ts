import { kv } from "@vercel/kv";

/**
 * Cache-through helper using Vercel KV.
 * Falls back to direct fetch if KV is unavailable (local dev without KV).
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await kv.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch {
    // KV not available — fall through to fetch
  }

  const data = await fetchFn();

  try {
    await kv.set(key, data, { ex: ttlSeconds });
  } catch {
    // KV write failed — continue with fresh data
  }

  return data;
}
