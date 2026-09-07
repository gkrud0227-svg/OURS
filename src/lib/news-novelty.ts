/**
 * 해외 식품 매체 스캔의 **신규성 판정** — 이력 대비 새로 등장했는가, 평소보다 번지는가.
 *
 * 라우트에서 분리한 이유는 쿼터·네트워크 없이 검증하기 위해서다
 * (scripts/news-novelty-check.mjs).
 */

/** 스캔 이력 — term별 누적 통계. */
export interface TermHistory {
  firstSeenAt: string;
  lastSeenAt: string;
  scans: number;
  /** 역대 최대 매체 수 — 참고용(하위호환). 판정에는 쓰지 않는다. */
  maxSources: number;
  /**
   * 최근 스캔들의 매체 수. **판정 기준선은 이 평균**이다.
   *
   * ⚠️ 예전엔 maxSources(역대 최대)를 넘겨야 "급부상"이었는데, 최대치는 한 번 오르면
   *    안 내려가서 문턱이 계속 높아졌다. 스캔을 반복할수록 모든 용어가 known 으로
   *    수렴한다(실측: 24회 스캔 뒤 상위 50개가 전부 known). 최근 창 평균이면
   *    "평소보다 많이 실렸는가"를 계속 물을 수 있다.
   */
  recent?: number[];
}

export type Novelty = "new" | "rising" | "known" | "baseline";

/** 기준선으로 볼 최근 스캔 수. */
export const RECENT_WINDOW = 8;
/** 평소보다 이 배수 이상 많은 매체에 실리면 "급부상". */
export const RISE_FACTOR = 1.5;
/** 매체 한 곳뿐이면 급부상으로 보지 않는다 — 우연히 한 번 실린 것과 구분이 안 된다. */
export const RISE_MIN_SOURCES = 2;

/** 최근 창 평균. 창이 없으면 예전 형식 이력의 maxSources 로 폴백한다. */
export function recentAverage(h: TermHistory | undefined): number | null {
  const xs = h?.recent;
  if (!xs?.length) return h?.maxSources ?? null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 평소(최근 창 평균)보다 눈에 띄게 많은 매체에 실렸는가. */
export function isRising(sources: number, h: TermHistory | undefined): boolean {
  if (sources < RISE_MIN_SOURCES) return false;
  const base = recentAverage(h);
  return base == null ? false : sources >= base * RISE_FACTOR;
}

/**
 * 한 용어의 신규성을 판정한다.
 * @param baselineJustSet 이력이 비어 있던 첫 스캔인가 — 그때는 전부 기준선으로 삼는다.
 */
export function noveltyOf(
  sources: number,
  h: TermHistory | undefined,
  baselineJustSet: boolean,
): Novelty {
  if (baselineJustSet) return "baseline";
  if (!h) return "new"; // 이력에 없던 말 = 새로 등장
  if (isRising(sources, h)) return "rising";
  return "known";
}

/** 이력을 갱신한다 (원본을 바꾸지 않고 새 값을 돌려준다). */
export function updateHistory(
  h: TermHistory | undefined,
  sources: number,
  now: string,
): TermHistory {
  if (!h) {
    return { firstSeenAt: now, lastSeenAt: now, scans: 1, maxSources: sources, recent: [sources] };
  }
  return {
    ...h,
    lastSeenAt: now,
    scans: h.scans + 1,
    maxSources: Math.max(h.maxSources, sources),
    // 최근 창을 밀어 넣는다 — 오래된 값은 버려 기준선이 현재를 따라가게 한다.
    recent: [...(h.recent ?? []), sources].slice(-RECENT_WINDOW),
  };
}
