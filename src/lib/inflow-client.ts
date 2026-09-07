/**
 * 해외 후보 → 국내 유입 판정 파이프라인 (브라우저에서 조립).
 *
 * 국내 발굴(store-context)이 그렇듯 오케스트레이션은 클라이언트에서 한다 — 각 단계가
 * 이미 라우트로 나뉘어 있고, 실패해도 나머지가 살아남게 하기 위해서다.
 *
 * 입력은 **두 소스를 합친 목록**이다(유튜브 + 해외 식품 매체, lib/overseas-sources.ts).
 * 소스마다 "해외에서 살아 있다"는 근거가 달라서, 그 판단은 합치는 쪽에서 이미 끝내고
 * 여기서는 `overseasAlive` 를 그대로 받아 쓴다.
 *
 * ⚠️ **유튜브 쿼터를 쓰지 않는다.** 후보는 이미 발굴된 것을 받아 쓰고, 여기 붙는 건
 *    표기 변환(네이버 검색·자동완성) + 데이터랩 + 검색광고뿐이다.
 */

import { fetchDataLab } from "./datalab";
import { fetchCandidates } from "./discovery";
import { fetchSpellings } from "./translit";
import { judgeInflow, INFLOW_RANK, type InflowStatus } from "./inflow";
import { SOURCE_RANK, type MergedCandidate, type OverseasSource } from "./overseas-sources";
import type { WeekPoint } from "./types";

export interface InflowRow {
  /** 해외 후보 원문(영어). */
  term: string;
  /** 어느 소스에서 나왔는가. */
  source: OverseasSource;
  /** 유튜브 급증 배수. 매체 단독이면 null. */
  lift: number | null;
  /** 유튜브 채널 수. */
  channels: number | null;
  /** 이 말이 등장한 해외 매체 수. */
  mediaCount: number | null;
  /** 예시(영상 제목 또는 기사 헤드라인). */
  sample: string | null;
  /** 국내 검색에 쓴 한글 표기. 확정 못 했으면 null. */
  spelling: string | null;
  /** 표기가 자동완성으로 실재 확인됐는가. */
  verified: boolean;
  status: InflowStatus;
  /** 국내 상승률(%). */
  riseRate: number | null;
  /** 국내 월간 검색량. */
  volumeTotal: number;
  weeks: WeekPoint[];
  score: number;
}

/** 국내 추이를 볼 기간(개월). 유입은 몇 달에 걸쳐 일어나므로 6개월을 본다. */
const LOOKBACK_MONTHS = 6;

/**
 * 표기 후보가 여럿일 때(두바이 초콜릿 / 두바이초콜릿) **신호가 가장 큰 것**을 고른다.
 * 띄어쓰기만 다른 같은 말이라 합산하지 않고 대표 하나만 쓴다 — 데이터랩 비율은
 * 검색어별로 정규화되므로 합산이 의미를 갖지 않는다.
 */
function pickBest(
  spellings: string[],
  weeksBy: Record<string, WeekPoint[]>,
): { spelling: string; weeks: WeekPoint[] } | null {
  let best: { spelling: string; weeks: WeekPoint[]; sum: number } | null = null;
  for (const s of spellings) {
    const w = weeksBy[s];
    if (!w) continue;
    const sum = w.reduce((a, b) => a + b.ratio, 0);
    if (!best || sum > best.sum) best = { spelling: s, weeks: w, sum };
  }
  return best ? { spelling: best.spelling, weeks: best.weeks } : null;
}

/**
 * 합쳐진 해외 후보들의 국내 유입 상태를 판정한다.
 * 표기 변환·데이터랩·검색광고 중 무엇이 실패해도 나머지는 살린다.
 */
export async function judgeOverseasInflow(candidates: MergedCandidate[]): Promise<InflowRow[]> {
  if (!candidates.length) return [];

  // 1) 영어 → 한글 표기
  let spellingByTerm: Record<string, { spellings: string[]; verified: boolean }> = {};
  try {
    const results = await fetchSpellings(candidates.map((c) => c.term));
    spellingByTerm = Object.fromEntries(
      results.map((r) => [r.term, { spellings: r.spellings, verified: r.verified }]),
    );
  } catch {
    // 표기 변환이 통째로 실패하면 전부 "표기 미확인"이 된다 — 조용히 미유입으로 만들지 않는다.
  }

  const allSpellings = [...new Set(Object.values(spellingByTerm).flatMap((v) => v.spellings))];

  // 2) 국내 검색 추이
  const weeksBy: Record<string, WeekPoint[]> = {};
  if (allSpellings.length) {
    const start = new Date();
    start.setMonth(start.getMonth() - LOOKBACK_MONTHS);
    try {
      const results = await fetchDataLab(allSpellings, {
        startDate: start.toISOString().slice(0, 10),
      });
      for (const r of results) {
        weeksBy[r.title] = r.data.map((d) => ({ period: d.period, ratio: d.ratio }));
      }
    } catch {
      // 데이터랩 실패 — 표기는 있지만 추이를 못 봤다. 아래에서 미확인으로 남는다.
    }
  }

  // 3) 국내 검색 규모 (보조 — 실패해도 진행)
  const volumeBy: Record<string, number> = {};
  if (allSpellings.length) {
    try {
      for (const r of await fetchCandidates(allSpellings)) volumeBy[r.name] = r.volumeTotal;
    } catch {
      /* 검색광고 실패는 무시 — 규모 미확인으로 판정한다 */
    }
  }

  // 4) 판정
  const rows: InflowRow[] = candidates.map((c) => {
    const entry = spellingByTerm[c.term];
    const picked = entry?.spellings.length ? pickBest(entry.spellings, weeksBy) : null;
    const weeks = picked?.weeks ?? null;
    const volumeTotal = picked ? (volumeBy[picked.spelling] ?? 0) : 0;
    const j = judgeInflow({
      lift: c.lift,
      overseasAlive: c.overseasAlive,
      weeks,
      volumeTotal,
    });
    return {
      term: c.term,
      source: c.source,
      lift: c.lift,
      channels: c.channels,
      mediaCount: c.mediaCount,
      sample: c.sample,
      spelling: picked?.spelling ?? null,
      verified: entry?.verified ?? false,
      status: j.status,
      riseRate: j.riseRate,
      volumeTotal,
      weeks: weeks ?? [],
      score: j.score,
    };
  });

  // 유입 상태가 먼저, 같은 상태면 양쪽에서 잡힌 것이 위로, 그다음 점수.
  return rows.sort(
    (a, b) =>
      INFLOW_RANK[b.status] - INFLOW_RANK[a.status] ||
      SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
      b.score - a.score,
  );
}
