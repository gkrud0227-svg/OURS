/**
 * LLM 트렌드 레이더 클라이언트 — 기사 텍스트에서 명명된 부상 트렌드를 뽑는다.
 * 추출된 구성어(keywords)는 해외 시드에 투입하고 전향적 로그에 source="radar"로 남긴다.
 */
import { logDiscovery } from "./discovery-log";

export interface RadarTrend {
  name: string;
  aliases: string[];
  keywords: string[];
  category: string;
  region: string;
  platform: string;
  rationale: string;
  confidence: number;
}

export interface RadarResult {
  trends: RadarTrend[];
  needsKey?: boolean;
  error?: string;
}

export async function fetchTrendRadar(text: string): Promise<RadarResult> {
  const res = await fetch("/api/trend-radar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = (await res.json()) as {
    trends?: RadarTrend[];
    needsKey?: boolean;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    return { trends: [], error: json.detail ? `${json.error} (${json.detail})` : json.error };
  }
  return { trends: json.trends ?? [], needsKey: json.needsKey };
}

/** 레이더가 명명한 트렌드의 구성어를 전향적 로그에 남긴다(source=radar). */
export async function logRadarTrend(trend: RadarTrend): Promise<void> {
  await logDiscovery(
    trend.keywords.map((kw) => ({
      term: kw,
      source: "radar",
      contextTag: "food",
    })),
  );
}

/* ---------- 무료 기사 키워드 추출 (LLM 없이) ---------- */

export interface ArticleTerm {
  term: string;
  count: number;
  food: boolean;
}

export async function fetchArticleTerms(input: {
  url?: string;
  text?: string;
}): Promise<{ terms: ArticleTerm[]; error?: string }> {
  const res = await fetch("/api/article-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { terms?: ArticleTerm[]; error?: string };
  if (!res.ok) return { terms: [], error: json.error };
  return { terms: json.terms ?? [] };
}

/** 기사에서 고른 후보어를 전향적 로그에 남긴다(source=article). */
export async function logArticleTerms(terms: string[]): Promise<void> {
  await logDiscovery(terms.map((t) => ({ term: t, source: "article" })));
}

/* ---------- 해외 식품 뉴스 스캔 (RSS 집계, 무료) ---------- */

export interface NewsTerm {
  term: string;
  count: number;
  sources: string[];
  sample: string;
  novelty: "new" | "rising" | "known" | "baseline";
}

export async function fetchFoodNews(): Promise<{
  terms: NewsTerm[];
  scanned: string[];
  failed: string[];
  crawled?: number;
  articles?: number;
  baselineJustSet?: boolean;
  error?: string;
}> {
  const res = await fetch("/api/food-news");
  const json = (await res.json()) as {
    terms?: NewsTerm[];
    scanned?: string[];
    failed?: string[];
    crawled?: number;
    articles?: number;
    baselineJustSet?: boolean;
    error?: string;
  };
  if (!res.ok) return { terms: [], scanned: [], failed: [], error: json.error };
  return {
    terms: json.terms ?? [],
    scanned: json.scanned ?? [],
    failed: json.failed ?? [],
    crawled: json.crawled,
    articles: json.articles,
    baselineJustSet: json.baselineJustSet,
  };
}
