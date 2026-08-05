/**
 * 1단계 — 전향적 발굴 로그 라벨링(프로토타입).
 *
 * 로그에 "언제 처음 봤나(firstSeenAt)"가 박힌 후보를, **발견 이후** 데이터랩 검색 곡선이
 * 실제로 떴는지로 hit/dud 판정한다. 판정기는 백테스트가 쓰는 것과 **동일**하다:
 *   - 급상승 감지 = `trendFromWeeks`(전주 대비 +30%, 4주 MA)
 *   - 노이즈 하한 = `SIGNAL_FLOOR`(상대지수 5 미만 급등은 무시)
 *
 * 백테스트(회고)와의 차이: 백테스트는 아는 히트를 넣어 "잡았을까"(재현율)를 보지만,
 * 여기선 **엔진이 올린 것 전부**를 앞으로 라벨링해 **정밀도·오탐률(FDR)**을 잰다.
 * 둘이 합쳐야 혼동행렬이 완성된다.
 *
 * ⚠️ 아직 창(window)이 안 지난 후보는 판정하지 않고 'pending'으로 분모에서 제외한다.
 *    (성숙 전 항목을 dud로 세면 오탐률이 부풀려지는 censoring 오류)
 */
import { trendFromWeeks } from "./trend";
import { SIGNAL_FLOOR } from "./backtest";
import type { WeekPoint } from "./types";

/** 발견 이후 "떴나"를 관찰하는 창(주). */
export const WINDOW_WEEKS = 8;
/** 이 주수만큼 관측돼야 판정한다. 미만이면 pending(아직 이르다). */
export const MIN_OBSERVE_WEEKS = 4;

export type DiscoveryLabel = "hit" | "dud" | "pending";

export interface LabelInput {
  term: string;
  firstSeenAt: string;
  source?: string | null;
  novel?: boolean | null;
  lift?: number | null;
}

export interface LabelResult extends LabelInput {
  label: DiscoveryLabel;
  /** 발견 이후 데이터랩에 존재한 주 수 */
  observedWeeks: number;
  /** 발견 시점 검색 수준(상대지수) */
  baselineRatio: number | null;
  /** 발견 이후 창 내 최고점 */
  peakAfter: number | null;
  /** (peakAfter − baseline)/baseline (%) */
  riseAfterPct: number | null;
  /** 발견 → 발견 후 최고점까지 주 */
  weeksToPeak: number | null;
  reason: string;
}

/** firstSeenAt 이하(같거나 이전) 마지막 주 인덱스. 곡선 시작 이전이면 -1. */
function firstSeenIndex(weeks: WeekPoint[], firstSeenAt: string): number {
  const d = firstSeenAt.slice(0, 10); // YYYY-MM-DD (주 period와 사전식 비교 가능)
  let idx = -1;
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].period <= d) idx = i;
    else break;
  }
  return idx;
}

export function labelEntry(
  input: LabelInput,
  weeks: WeekPoint[],
  opts: { window?: number; minObserve?: number } = {},
): LabelResult {
  const window = opts.window ?? WINDOW_WEEKS;
  const minObserve = opts.minObserve ?? MIN_OBSERVE_WEEKS;
  const stub = {
    ...input,
    baselineRatio: null,
    peakAfter: null,
    riseAfterPct: null,
    weeksToPeak: null,
  };

  if (!weeks.length) {
    return { ...stub, label: "pending", observedWeeks: 0, reason: "데이터랩 곡선 없음" };
  }

  let idx0 = firstSeenIndex(weeks, input.firstSeenAt);
  if (idx0 < 0) idx0 = 0; // 발견일이 곡선 시작 이전 → 곡선 처음부터 관측

  const observedWeeks = weeks.length - 1 - idx0;
  if (observedWeeks < minObserve) {
    return {
      ...stub,
      label: "pending",
      observedWeeks,
      reason: `관측 ${observedWeeks}주 < ${minObserve}주 (아직 판정 이르다)`,
    };
  }

  const baselineRatio = weeks[idx0].ratio;
  const end = Math.min(idx0 + window, weeks.length - 1);

  // 발견 이후 창 내 최고점
  let peakAfter = weeks[idx0].ratio;
  let peakIdx = idx0;
  for (let i = idx0; i <= end; i++) {
    if (weeks[i].ratio > peakAfter) {
      peakAfter = weeks[i].ratio;
      peakIdx = i;
    }
  }

  // 급상승 판정기(백테스트 재활용)를 **발견 이후** walk-forward로 적용.
  // 각 주 i에서 그 주까지의 데이터만으로 판정 → 미래 미참조.
  let surged = false;
  for (let i = Math.max(idx0, 3); i <= end; i++) {
    const st = trendFromWeeks(weeks.slice(0, i + 1));
    if (st.status === "surge" && weeks[i].ratio >= SIGNAL_FLOOR) {
      surged = true;
      break;
    }
  }

  const riseAfterPct =
    baselineRatio > 0 ? Math.round(((peakAfter - baselineRatio) / baselineRatio) * 100) : null;
  const weeksToPeak = peakIdx - idx0;
  const label: DiscoveryLabel = surged && peakAfter >= SIGNAL_FLOOR ? "hit" : "dud";
  const reason =
    label === "hit"
      ? `발견 후 ${weeksToPeak}주 내 급상승 (피크 지수 ${Math.round(peakAfter)})`
      : surged
        ? `급상승은 있었으나 수준이 낮음 (피크 ${Math.round(peakAfter)} < 하한 ${SIGNAL_FLOOR})`
        : `발견 후 ${window}주간 급상승 신호 없음`;

  return {
    ...stub,
    label,
    observedWeeks,
    baselineRatio,
    peakAfter: Math.round(peakAfter),
    riseAfterPct,
    weeksToPeak,
    reason,
  };
}

export interface BucketStat {
  key: string;
  matured: number;
  hit: number;
  dud: number;
  /** 오탐률 = dud / matured */
  fdr: number | null;
}

export interface LabelSummary {
  total: number;
  matured: number;
  pending: number;
  hit: number;
  dud: number;
  /** 오탐률(False Discovery Rate) = dud / matured */
  fdr: number | null;
  /** 정밀도 = hit / matured = 1 − fdr */
  precision: number | null;
  bySource: BucketStat[];
  byNovel: BucketStat[];
}

function bucketize(results: LabelResult[], keyFn: (r: LabelResult) => string): BucketStat[] {
  const m = new Map<string, BucketStat>();
  for (const r of results) {
    if (r.label === "pending") continue;
    const k = keyFn(r);
    const b = m.get(k) ?? { key: k, matured: 0, hit: 0, dud: 0, fdr: null };
    b.matured += 1;
    if (r.label === "hit") b.hit += 1;
    else b.dud += 1;
    m.set(k, b);
  }
  return [...m.values()]
    .map((b) => ({ ...b, fdr: b.matured ? b.dud / b.matured : null }))
    .sort((a, b) => b.matured - a.matured);
}

export function summarizeLabels(results: LabelResult[]): LabelSummary {
  const matured = results.filter((r) => r.label !== "pending");
  const hit = matured.filter((r) => r.label === "hit").length;
  const dud = matured.filter((r) => r.label === "dud").length;
  const n = matured.length;
  return {
    total: results.length,
    matured: n,
    pending: results.length - n,
    hit,
    dud,
    fdr: n ? dud / n : null,
    precision: n ? hit / n : null,
    bySource: bucketize(results, (r) => r.source ?? "(미상)"),
    byNovel: bucketize(results, (r) => (r.novel ? "신규 등장" : "기존")),
  };
}
