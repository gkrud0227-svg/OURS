/**
 * 3단계 — 자기강화 신호 가중치.
 *
 * 라벨링 결과(hit/dud)를 **버킷별 정밀도**로 집계해, 발굴 점수에 곱할 **신뢰 가중치**를 만든다.
 * 전환이 잘 되는 신호 프로필(출처·신규여부)은 가산, 헛방 많은 프로필은 감산.
 *
 * 안전장치(소표본·콜드스타트에서 폭주 방지):
 *  1) 성숙 표본이 MIN_MATURED 미만이면 **전부 중립(×1.0)** — 데이터 없으면 아무 영향 없음.
 *  2) 버킷 정밀도는 전역 정밀도로 **수축(shrinkage)** — 표본 적은 버킷은 전역값으로 당겨져
 *     한두 건에 휘둘리지 않는다(경험적 베이즈 근사).
 *  3) 가중치는 [WEIGHT_MIN, WEIGHT_MAX]로 **클램프** — 학습이 riseRate/검색량을 압도하지 않게.
 *
 * ⚠️ 검색 피크(데이터랩)는 매출이 아니라 프록시다. 가중치는 딱딱한 규칙이 아니라 부드러운 사전이다.
 */
import type { LabelResult } from "./discovery-label";

/** 이만큼 성숙 라벨이 쌓여야 가중치를 켠다(미만이면 전부 중립). */
export const MIN_MATURED = 8;
/** 수축 강도(가상 관측 수) — 클수록 버킷이 전역 정밀도로 강하게 당겨진다. */
export const SHRINKAGE = 5;
/** 개별 버킷 가중치 상·하한. */
export const WEIGHT_MIN = 0.7;
export const WEIGHT_MAX = 1.3;
/** 출처×신규 결합 후 최종 상·하한. */
export const COMBINED_MIN = 0.6;
export const COMBINED_MAX = 1.4;

export interface SignalWeights {
  generatedAt: string;
  matured: number;
  globalPrecision: number | null;
  /** 출처별 가중치(예: youtube, autocomplete, article, radar) */
  bySource: Record<string, number>;
  /** 신규여부별 가중치 — 키: "novel" | "known" */
  byNovel: Record<string, number>;
}

export function neutralWeights(matured = 0): SignalWeights {
  return { generatedAt: "", matured, globalPrecision: null, bySource: {}, byNovel: {} };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

interface Tally {
  hit: number;
  n: number;
}

function tally(results: LabelResult[], keyFn: (r: LabelResult) => string): Map<string, Tally> {
  const m = new Map<string, Tally>();
  for (const r of results) {
    if (r.label === "pending") continue;
    const k = keyFn(r);
    const t = m.get(k) ?? { hit: 0, n: 0 };
    t.n += 1;
    if (r.label === "hit") t.hit += 1;
    m.set(k, t);
  }
  return m;
}

/** 버킷 가중치 = (수축 정밀도 / 전역 정밀도) 를 캡. */
function bucketWeights(
  tallies: Map<string, Tally>,
  globalPrecision: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of tallies) {
    // 수축: 표본이 적으면 전역 정밀도로 당긴다.
    const shrunk = (t.hit + SHRINKAGE * globalPrecision) / (t.n + SHRINKAGE);
    out[k] = clamp(shrunk / globalPrecision, WEIGHT_MIN, WEIGHT_MAX);
  }
  return out;
}

export function computeSignalWeights(
  results: LabelResult[],
  generatedAt: string,
): SignalWeights {
  const matured = results.filter((r) => r.label !== "pending");
  const n = matured.length;
  // 콜드스타트/소표본 또는 전역 정밀도가 0·1(방향 학습 불가)이면 중립.
  const hit = matured.filter((r) => r.label === "hit").length;
  const globalPrecision = n ? hit / n : null;
  if (n < MIN_MATURED || globalPrecision === null || globalPrecision <= 0 || globalPrecision >= 1) {
    return { ...neutralWeights(n), globalPrecision, generatedAt };
  }

  return {
    generatedAt,
    matured: n,
    globalPrecision,
    bySource: bucketWeights(tally(results, (r) => r.source ?? "(미상)"), globalPrecision),
    byNovel: bucketWeights(tally(results, (r) => (r.novel ? "novel" : "known")), globalPrecision),
  };
}

/** 후보 하나에 적용할 최종 배수(출처×신규, 캡). 모르면 1.0(중립). */
export function weightFor(
  weights: SignalWeights,
  signal: { source?: string | null; novel?: boolean | null },
): number {
  const ws = weights.bySource[signal.source ?? "(미상)"] ?? 1;
  const wn = weights.byNovel[signal.novel ? "novel" : "known"] ?? 1;
  return clamp(ws * wn, COMBINED_MIN, COMBINED_MAX);
}

/** 기본 점수에 배수를 적용(0~100 클램프, 반올림). */
export function applyWeight(baseScore: number, multiplier: number): number {
  return Math.round(clamp(baseScore * multiplier, 0, 100));
}
