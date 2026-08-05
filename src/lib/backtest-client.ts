import type { BacktestResult, BacktestSummary } from "./backtest";
import type { ContentBacktestResult, ContentSummary } from "./content-backtest";
import type { CoverageHit, CoverageSummary } from "./coverage";

export interface BacktestResponse {
  startDate: string;
  endDate: string;
  results: BacktestResult[];
  summary: BacktestSummary;
  missingData: string[];
}

export interface ContentBacktestResponse {
  results: ContentBacktestResult[];
  summary: ContentSummary;
  ytError?: string;
}

export interface CoverageResponse {
  seeds: string[];
  poolSize: number;
  results: CoverageHit[];
  summary: CoverageSummary;
}

export async function fetchBacktest(
  keywords: string[],
  range?: { startDate?: string; endDate?: string },
): Promise<BacktestResponse> {
  const res = await fetch("/api/backtest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, ...range }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    const e = json as { error?: string; detail?: string };
    throw new Error(e?.detail ? `${e.error ?? "백테스트 실패"} (${e.detail})` : (e?.error ?? "백테스트 실패"));
  }
  return json as BacktestResponse;
}

export async function fetchContentBacktest(
  items: { keyword: string; signalPeriod: string | null; peakPeriod: string | null }[],
): Promise<ContentBacktestResponse> {
  const res = await fetch("/api/backtest/content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    const e = json as { error?: string; detail?: string };
    throw new Error(e?.detail ? `${e.error ?? "콘텐츠 검증 실패"} (${e.detail})` : (e?.error ?? "콘텐츠 검증 실패"));
  }
  return json as ContentBacktestResponse;
}

export async function fetchCoverage(
  seeds: string[],
  hits: string[],
): Promise<CoverageResponse> {
  const res = await fetch("/api/coverage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds, hits }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    const e = json as { error?: string; detail?: string };
    throw new Error(e?.detail ? `${e.error ?? "커버리지 실패"} (${e.detail})` : (e?.error ?? "커버리지 실패"));
  }
  return json as CoverageResponse;
}
