import { cachedFetch } from "./cache";
import { KeywordRanking } from "@/types";

const API_KEY = process.env.SE_RANKINGS_PROJECT_API_TOKEN!;
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PositionEntry {
  date: string;
  pos: number;
  change: number;
}

interface PositionKeyword {
  id: string;
  name: string;
  positions: PositionEntry[];
  volume: number;
  competition: number;
}

interface PositionEngine {
  site_engine_id: number;
  keywords: PositionKeyword[];
}

interface SERankingStatResponse {
  site_id: number;
  total_up: number;
  total_down: number;
  today_avg: number;
  yesterday_avg: number;
  top5: number;
  top10: number;
  top30: number;
  visibility: number;
  visibility_percent: number;
  domain_trust: number;
}

export interface SERankingStats {
  avgPosition: number;
  avgPositionChange: number;
  top3: number;
  top3Change: number;
  top10: number;
  top30: number;
  top100: number;
  organicKeywords: number;
  avgPositionHistory: number[];
  top3History: number[];
  organicKeywordsHistory: number[];
}

// ─── Shared positions fetch (cached) ──────────────────────────────────────────

function getPositions(projectId: string): Promise<PositionEngine[]> {
  return cachedFetch(`ser:positions:${projectId}`, CACHE_TTL, async () => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    return seRankingsRequest<PositionEngine[]>(
      `/sites/${projectId}/positions?date_from=${fmt(from)}&date_to=${fmt(now)}`
    );
  });
}

// ─── Keyword Rankings ─────────────────────────────────────────────────────────

/**
 * Get current keyword rankings from position data (primary search engine)
 */
export async function getKeywordRankings(projectId: string): Promise<KeywordRanking[]> {
  const posData = await getPositions(projectId);
  const engine = posData[0]; // primary engine (Google)
  if (!engine) return [];

  return engine.keywords.map((kw) => {
    const latest = kw.positions[kw.positions.length - 1];
    const prev = kw.positions.length >= 2 ? kw.positions[kw.positions.length - 2] : null;
    const currentPos = latest?.pos || 0;
    const prevPos = prev?.pos || 0;

    return {
      id: String(kw.id),
      keyword: kw.name,
      currentPosition: currentPos,
      previousPosition: prevPos,
      change: prevPos > 0 && currentPos > 0 ? prevPos - currentPos : 0, // positive = improved
      searchVolume: kw.volume || 0,
    };
  });
}

/**
 * Count keywords that improved position
 */
export async function getKeywordsImprovedCount(projectId: string): Promise<number> {
  const rankings = await getKeywordRankings(projectId);
  return rankings.filter((kw) => kw.change > 0).length;
}

// ─── Project Stats ────────────────────────────────────────────────────────────

/**
 * Get aggregate project stats with sparkline history (free reporting)
 */
export async function getProjectStats(projectId: string): Promise<SERankingStats> {
  return cachedFetch(`ser:stats:v3:${projectId}`, CACHE_TTL, async () => {
    const [stat, posData] = await Promise.all([
      seRankingsRequest<SERankingStatResponse>(`/sites/${projectId}/stat`),
      getPositions(projectId),
    ]);

    // Aggregate daily stats from first engine (primary/Google)
    const engine = posData[0];
    const dailyMap: Record<string, { positions: number[]; top3: number }> = {};

    if (engine) {
      for (const kw of engine.keywords) {
        for (const p of kw.positions) {
          if (!dailyMap[p.date]) dailyMap[p.date] = { positions: [], top3: 0 };
          if (p.pos > 0) {
            dailyMap[p.date].positions.push(p.pos);
            if (p.pos <= 3) dailyMap[p.date].top3++;
          }
        }
      }
    }

    const sortedDates = Object.keys(dailyMap).sort();
    const avgPositionHistory = sortedDates.map((d) => {
      const ps = dailyMap[d].positions;
      return ps.length > 0 ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : 0;
    });
    const top3History = sortedDates.map((d) => dailyMap[d].top3);
    // Organic keywords = how many keywords are ranking (pos > 0) each day
    const organicKeywordsHistory = sortedDates.map((d) => dailyMap[d].positions.length);

    const top3Now = top3History[top3History.length - 1] || 0;
    const top3Prev = top3History[0] || 0;

    let top100 = 0;
    if (engine) {
      for (const kw of engine.keywords) {
        const latest = kw.positions[kw.positions.length - 1];
        if (latest && latest.pos > 0 && latest.pos <= 100) top100++;
      }
    }

    return {
      avgPosition: stat.today_avg || 0,
      avgPositionChange: (stat.yesterday_avg || 0) - (stat.today_avg || 0),
      top3: top3Now,
      top3Change: top3Now - top3Prev,
      top10: stat.top10 || 0,
      top30: stat.top30 || 0,
      top100,
      organicKeywords: organicKeywordsHistory[organicKeywordsHistory.length - 1] || 0,
      avgPositionHistory,
      top3History,
      organicKeywordsHistory,
    };
  });
}
