import type { WeekPoint } from "./types";
import { trendFromWeeks, RISE_THRESHOLD } from "./trend";

/**
 * 히트 적중률 백테스트.
 *
 * 과거 히트 키워드의 데이터랩 전체 곡선에 **지금 쓰는 급상승 로직을 그대로**
 * walk-forward로 적용해, "실제 피크 전에 급상승 신호가 떴는가"를 사후 검증한다.
 *
 * ── look-ahead(미래 참조) 편향은 없다 ─────────────────────────────
 * 데이터랩은 구간 전체의 피크를 100으로 정규화한다. 하지만 급상승 판정은
 * `trendFromWeeks`의 **주간 % 변화율(비율)**로 하므로 정규화 배율에 불변이다.
 * 즉 전체 구간을 한 번 받아 계산해도, 매주 과거만 보고 판정한 결과와 같다.
 *
 * 신호 판정에 쓰는 **절대 수준 하한(SIGNAL_FLOOR)** 은 오히려 보수적이다.
 * 실시간 정규화(그 시점까지의 최대값 기준) 값은 전체 정규화 값보다 항상 크거나
 * 같기 때문에, 전체 곡선에서 하한을 넘겼다면 실시간에서도 반드시 넘긴다.
 * 따라서 이 백테스트는 모델의 실제 조기 감지력을 **과소평가**할 수 있다.
 */

/** 이 상대지수 미만에서의 급상승은 노이즈로 보고 신호로 인정하지 않는다. */
export const SIGNAL_FLOOR = 5;

/** 소싱·입고를 감안한 "실행 가능한" 최소 리드타임(주). */
export const ACTIONABLE_LEAD_WEEKS = 4;

export type BacktestVerdict = "actionable" | "hit" | "late" | "missed";

export interface BacktestResult {
  keyword: string;
  weeks: WeekPoint[];
  /** 곡선상 최고점 */
  peakIndex: number;
  peakPeriod: string;
  peakRatio: number;
  /** 급상승 신호가 처음 뜬 주 (없으면 null) */
  signalIndex: number | null;
  signalPeriod: string | null;
  signalRatio: number | null;
  /** 신호 시점 상승률(%) — 실제 대시보드가 계산했을 값 */
  signalRiseRate: number | null;
  /** 피크까지 남은 주 = peakIndex − signalIndex (양수면 피크 전에 잡음) */
  leadWeeks: number | null;
  /** 신호 시점의 곡선 높이 = 피크 대비 몇 %였나 (낮을수록 초기에 잡음) */
  caughtAtPctOfPeak: number | null;
  verdict: BacktestVerdict;
}

function findPeak(weeks: WeekPoint[]): number {
  let idx = 0;
  for (let i = 1; i < weeks.length; i += 1) {
    if (weeks[i].ratio > weeks[idx].ratio) idx = i;
  }
  return idx;
}

/**
 * 첫 급상승 주를 walk-forward로 찾는다.
 * 각 주 i에서 **그 주까지의 데이터만** 넘겨(`slice(0, i+1)`) 미래를 참조하지 않는다.
 * `trendFromWeeks`는 내부에서 마지막 4주만 보므로 이는 실시간 판정과 동일하다.
 */
function findFirstSurge(weeks: WeekPoint[]): number | null {
  // 최소 4주가 있어야 MA 기반 상승률이 온전하다.
  for (let i = 3; i < weeks.length; i += 1) {
    const stat = trendFromWeeks(weeks.slice(0, i + 1));
    if (stat.status === "surge" && weeks[i].ratio >= SIGNAL_FLOOR) return i;
  }
  return null;
}

export function backtestKeyword(keyword: string, weeks: WeekPoint[]): BacktestResult {
  const peakIndex = findPeak(weeks);
  const peak = weeks[peakIndex];
  const signalIndex = findFirstSurge(weeks);

  let leadWeeks: number | null = null;
  let caughtAtPctOfPeak: number | null = null;
  let signalRiseRate: number | null = null;
  let verdict: BacktestVerdict = "missed";

  if (signalIndex !== null) {
    leadWeeks = peakIndex - signalIndex;
    caughtAtPctOfPeak = peak.ratio > 0
      ? Math.round((weeks[signalIndex].ratio / peak.ratio) * 100)
      : null;
    signalRiseRate = trendFromWeeks(weeks.slice(0, signalIndex + 1)).riseRate;

    if (leadWeeks >= ACTIONABLE_LEAD_WEEKS) verdict = "actionable";
    else if (leadWeeks >= 1) verdict = "hit";
    else verdict = "late";
  }

  return {
    keyword,
    weeks,
    peakIndex,
    peakPeriod: peak?.period ?? "",
    peakRatio: peak?.ratio ?? 0,
    signalIndex,
    signalPeriod: signalIndex !== null ? weeks[signalIndex].period : null,
    signalRatio: signalIndex !== null ? weeks[signalIndex].ratio : null,
    signalRiseRate,
    leadWeeks,
    caughtAtPctOfPeak,
    verdict,
  };
}

export const VERDICT_META: Record<
  BacktestVerdict,
  { label: string; desc: string; tone: "good" | "mid" | "bad" }
> = {
  actionable: {
    label: "조기 적중",
    desc: `피크 ${ACTIONABLE_LEAD_WEEKS}주 이상 전에 급상승을 감지 — 소싱·입고가 가능한 실행 리드타임`,
    tone: "good",
  },
  hit: {
    label: "적중",
    desc: "피크 전에 급상승을 감지했으나 리드타임이 짧아 실행 여유는 부족",
    tone: "mid",
  },
  late: {
    label: "지연",
    desc: "급상승을 감지했지만 이미 피크 시점이거나 이후 — 예측 실패",
    tone: "bad",
  },
  missed: {
    label: "미감지",
    desc: `급상승(전주 대비 +${RISE_THRESHOLD}%) 신호가 한 번도 뜨지 않음`,
    tone: "bad",
  },
};

export interface BacktestSummary {
  total: number;
  /** 피크 전에 감지한 건수 (actionable + hit) */
  hit: number;
  /** 실행 리드타임까지 확보한 건수 (actionable) */
  actionable: number;
  hitRate: number;
  actionableRate: number;
  /** 감지 성공 건들의 중앙값 리드타임(주) */
  medianLeadWeeks: number | null;
}

export function summarize(results: BacktestResult[]): BacktestSummary {
  const total = results.length;
  const hits = results.filter((r) => r.verdict === "actionable" || r.verdict === "hit");
  const actionable = results.filter((r) => r.verdict === "actionable");
  const leads = hits
    .map((r) => r.leadWeeks)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const median = leads.length
    ? leads[Math.floor((leads.length - 1) / 2)]
    : null;
  return {
    total,
    hit: hits.length,
    actionable: actionable.length,
    hitRate: total ? Math.round((hits.length / total) * 100) : 0,
    actionableRate: total ? Math.round((actionable.length / total) * 100) : 0,
    medianLeadWeeks: median,
  };
}
