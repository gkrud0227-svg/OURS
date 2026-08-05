import { MIN_DISCOVERY_VOLUME } from "./trend";
import type { RawCandidate } from "./keywordstool";

/**
 * 시드별 발굴 커버리지.
 *
 * 백테스트가 "이 키워드를 추적했다면 급상승을 잡았을까"를 봤다면, 여기선
 * "이 시드로 발굴했다면 이 키워드가 후보에 **잡히기라도** 했을까"를 본다.
 * (감지 가능 ≠ 발굴 가능 — 팥빙수는 감지되지만 잘못된 시드에선 발굴 안 됐다)
 */

/** 대시보드가 추세를 조회하고 표에 노출하는 상위 후보 수 (store-context의 TREND_TOP과 동일). */
export const DASHBOARD_TOP = 24;

export type CoverageStatus =
  | "onDashboard" // 검색량 상위 24 안 → 대시보드에 실제로 뜬다
  | "surfacedButCut" // 발굴은 됐으나 24위 밖이라 화면엔 안 뜬다
  | "belowVolume" // 후보엔 있으나 월검색량 1만 미만이라 걸러짐
  | "notSurfaced"; // 이 시드로는 아예 안 나옴

export interface CoverageHit {
  keyword: string;
  status: CoverageStatus;
  /** 월검색량 1만+ 풀에서의 순위 (1-based). 못 들면 null */
  rank: number | null;
  volumeTotal: number | null;
}

export interface CoverageSummary {
  total: number;
  /** 대시보드 상위 24에 실제로 노출되는 히트 수 */
  onDashboard: number;
  /** 발굴이라도 된 히트 수 (onDashboard + surfacedButCut) */
  surfaced: number;
  /** onDashboard / total (%) — 대시보드가 이 히트들을 놓치지 않는 비율 */
  coverageRate: number;
}

function norm(s: string): string {
  return (s ?? "").replace(/\s+/g, "");
}

export function computeCoverage(
  candidates: RawCandidate[],
  hits: string[],
): { hits: CoverageHit[]; summary: CoverageSummary } {
  // 대시보드가 실제로 보는 풀: 월검색량 1만+ (이미 노이즈 제거·검색량 정렬됨)
  const pool = candidates.filter((c) => c.volumeTotal >= MIN_DISCOVERY_VOLUME);
  const poolNorm = pool.map((c) => norm(c.name));
  const allByNorm = new Map<string, RawCandidate>();
  for (const c of candidates) {
    const k = norm(c.name);
    if (!allByNorm.has(k)) allByNorm.set(k, c);
  }

  const results: CoverageHit[] = hits.map((hit) => {
    const n = norm(hit);
    const idx = poolNorm.indexOf(n);
    if (idx >= 0) {
      const rank = idx + 1;
      return {
        keyword: hit,
        status: rank <= DASHBOARD_TOP ? "onDashboard" : "surfacedButCut",
        rank,
        volumeTotal: pool[idx].volumeTotal,
      };
    }
    const below = allByNorm.get(n);
    if (below) {
      return { keyword: hit, status: "belowVolume", rank: null, volumeTotal: below.volumeTotal };
    }
    return { keyword: hit, status: "notSurfaced", rank: null, volumeTotal: null };
  });

  const onDashboard = results.filter((r) => r.status === "onDashboard").length;
  const surfaced = results.filter(
    (r) => r.status === "onDashboard" || r.status === "surfacedButCut",
  ).length;

  return {
    hits: results,
    summary: {
      total: hits.length,
      onDashboard,
      surfaced,
      coverageRate: hits.length ? Math.round((onDashboard / hits.length) * 100) : 0,
    },
  };
}

export const COVERAGE_META: Record<
  CoverageStatus,
  { label: string; desc: string; tone: "good" | "mid" | "bad" }
> = {
  onDashboard: {
    label: "대시보드 노출",
    desc: `검색량 상위 ${DASHBOARD_TOP}위 안 — 이 시드로 발굴하면 화면에 실제로 뜬다`,
    tone: "good",
  },
  surfacedButCut: {
    label: "순위 밖",
    desc: `후보엔 있으나 검색량 ${DASHBOARD_TOP}위 밖이라 화면엔 안 뜬다 — 시드를 좁히면 올라온다`,
    tone: "mid",
  },
  belowVolume: {
    label: "검색량 미달",
    desc: "후보엔 있으나 월검색량 1만 미만이라 발굴에서 제외됨",
    tone: "mid",
  },
  notSurfaced: {
    label: "미발굴",
    desc: "이 시드로는 연관 후보에 아예 안 나옴 — 시드가 이 키워드를 못 잡는다",
    tone: "bad",
  },
};
