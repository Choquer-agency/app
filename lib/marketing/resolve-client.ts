import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let current = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(
        prev[j] + 1,
        current + 1,
        prev[j - 1] + cost
      );
      prev[j - 1] = current;
      current = next;
    }
    prev[n] = current;
  }
  return prev[n];
}

export interface ClientResolution {
  match: Doc<"clients"> | null;
  candidates: Doc<"clients">[];
  reason?: string;
}

export async function resolveClientByName(rawName: string): Promise<ClientResolution> {
  const convex = getConvexClient();
  const all = (await convex.query(api.clients.list, {} as any)) as Doc<"clients">[];
  const active = all.filter((c) => c.active !== false);
  const query = normalize(rawName);

  if (!query) {
    return { match: null, candidates: [], reason: "Empty client name" };
  }

  // 1. Exact normalized match on name or slug
  const exact = active.filter(
    (c) => normalize(c.name) === query || normalize(c.slug) === query
  );
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  if (exact.length > 1) {
    return {
      match: null,
      candidates: exact,
      reason: `Multiple clients match "${rawName}" exactly`,
    };
  }

  // 2. Substring match
  const substring = active.filter((c) => {
    const name = normalize(c.name);
    const slug = normalize(c.slug);
    return name.includes(query) || query.includes(name) || slug.includes(query);
  });
  if (substring.length === 1) return { match: substring[0], candidates: substring };
  if (substring.length > 1 && substring.length <= 5) {
    return {
      match: null,
      candidates: substring,
      reason: `Multiple clients match "${rawName}". Be more specific.`,
    };
  }

  // 3. Fuzzy (Levenshtein) — only keep within a reasonable threshold
  const scored = active
    .map((c) => ({
      client: c,
      dist: Math.min(
        levenshtein(query, normalize(c.name)),
        levenshtein(query, normalize(c.slug))
      ),
    }))
    .sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  if (best && best.dist <= Math.max(2, Math.floor(query.length / 4))) {
    return { match: best.client, candidates: [best.client] };
  }

  const suggestions = scored.slice(0, 3).map((s) => s.client);
  return {
    match: null,
    candidates: suggestions,
    reason: `No client matching "${rawName}". Did you mean: ${suggestions.map((c) => c.name).join(", ")}?`,
  };
}
