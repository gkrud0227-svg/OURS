import type { Keyword, ScoreKey, WeekPoint } from "./types";

/** 전주 대비 상승률이 이 값(%) 이상이면 "급상승"으로 분류. */
export const RISE_THRESHOLD = 30;

export type TrendStatus = "surge" | "up" | "flat" | "down" | "none";

export interface TrendStat {
  current: number | null;
  previous: number | null;
  /** 전주 대비 상승률(%) */
  riseRate: number | null;
  status: TrendStatus;
}

export function lastWeeks(weeks: WeekPoint[], n = 4): WeekPoint[] {
  return weeks.slice(-n);
}

export function statusOf(riseRate: number): TrendStatus {
  if (riseRate >= RISE_THRESHOLD) return "surge";
  if (riseRate >= 5) return "up";
  if (riseRate > -5) return "flat";
  return "down";
}

/** 최근 4주 데이터로 상승률과 상태를 계산. */
export function trendFromWeeks(weeks: WeekPoint[]): TrendStat {
  const w = lastWeeks(weeks, 4);
  if (w.length < 2) {
    return {
      current: w.length ? w[w.length - 1].ratio : null,
      previous: null,
      riseRate: null,
      status: "none",
    };
  }
  const current = w[w.length - 1].ratio;
  const previous = w[w.length - 2].ratio;
  const riseRate =
    previous === 0
      ? current > 0
        ? 100
        : 0
      : ((current - previous) / previous) * 100;
  return { current, previous, riseRate, status: statusOf(riseRate) };
}

export function computeTrend(keyword: Keyword): TrendStat {
  return trendFromWeeks(keyword.weeks);
}

/**
 * 발굴 점수(0~100): 검색량(정규화)과 상승률을 결합.
 * 검색량 55% + 상승률 45% 가중. 상승률은 -20%→0, +50%→1 로 매핑.
 */
export function discoveryScore(
  volumeNorm: number,
  riseRate: number | null,
): number {
  const v = Math.max(0, Math.min(1, volumeNorm));
  const riseNorm =
    riseRate === null ? 0.35 : Math.max(0, Math.min(1, (riseRate + 20) / 70));
  return Math.round((0.55 * v + 0.45 * riseNorm) * 100);
}

export const STATUS_META: Record<
  TrendStatus,
  { label: string; emoji: string }
> = {
  surge: { label: "급상승", emoji: "🔥" },
  up: { label: "상승", emoji: "📈" },
  flat: { label: "보합", emoji: "➡️" },
  down: { label: "하락", emoji: "📉" },
  none: { label: "데이터 없음", emoji: "—" },
};

/* ---------- 스코어카드 ---------- */

export const SCORE_MAX = 20;
export const SCORE_TOTAL_MAX = SCORE_MAX * 5;
export const GO_THRESHOLD = 80;

export const SCORE_META: { key: ScoreKey; label: string; hint: string }[] = [
  { key: "trendSignal", label: "트렌드 신호", hint: "검색·언급 급상승 강도" },
  { key: "scarcity", label: "희소성", hint: "시장 내 경쟁·포화가 낮을수록 높음" },
  { key: "vendingFit", label: "자판기 적합성", hint: "무인 자판기 판매·보관 적합도" },
  { key: "sourcing", label: "소싱 가능성", hint: "원재료·완제품 조달 용이성" },
  { key: "priceFit", label: "가격 적합성", hint: "목표 판매가 대비 원가 여유" },
];

export function totalScore(scores: Record<ScoreKey, number>): number {
  return SCORE_META.reduce((sum, m) => sum + (scores[m.key] || 0), 0);
}

export type VerdictKey = "go" | "improve" | "next";

export function verdict(total: number): {
  key: VerdictKey;
  label: string;
} {
  if (total >= GO_THRESHOLD) return { key: "go", label: "즉시 진행" };
  if (total >= 60) return { key: "improve", label: "조건 개선" };
  return { key: "next", label: "다음 후보" };
}

/** 상승률 내림차순 정렬(데이터 없음은 뒤로). */
export function byRiseDesc(a: Keyword, b: Keyword): number {
  const ra = computeTrend(a).riseRate;
  const rb = computeTrend(b).riseRate;
  if (ra === null && rb === null) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return rb - ra;
}
