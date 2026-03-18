import { cachedFetch } from "./cache";
import { KeywordRanking } from "@/types";

const API_KEY = process.env.SE_RANKINGS_API_KEY!;
const BASE_URL = "https://api4.seranking.com";
const CACHE_TTL = 43200; // 12 hours

async function seRankingsRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Token ${API_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`SE Rankings API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

interface SERankingKeyword {
  id: number;
  name: string;
  position: number;
  prev_position: number;
  volume: number;
}

/**
 * Get current keyword rankings for a project
 */
export async function getKeywordRankings(projectId: string): Promise<KeywordRanking[]> {
  return cachedFetch(`ser:rankings:${projectId}`, CACHE_TTL, async () => {
    const data = await seRankingsRequest<SERankingKeyword[]>(
      `/sites/${projectId}/keywords/rankings`
    );

    return data.map((kw) => ({
      id: String(kw.id),
      keyword: kw.name,
      currentPosition: kw.position || 0,
      previousPosition: kw.prev_position || 0,
      change: (kw.prev_position || 0) - (kw.position || 0), // positive = improved
      searchVolume: kw.volume || 0,
    }));
  });
}

/**
 * Count keywords that improved position
 */
export async function getKeywordsImprovedCount(projectId: string): Promise<number> {
  const rankings = await getKeywordRankings(projectId);
  return rankings.filter((kw) => kw.change > 0).length;
}
