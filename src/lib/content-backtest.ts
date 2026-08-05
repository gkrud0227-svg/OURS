/**
 * 콘텐츠 교차검증 백테스트.
 *
 * 검색 백테스트가 "검색이 언제 급상승했나"를 봤다면, 여기선
 * "SNS 콘텐츠(YouTube 영상)가 언제 먼저 늘기 시작했나"를 보고
 * **콘텐츠 급증 시점 vs 검색 신호 vs 검색 피크**의 시차를 잰다.
 *
 * 방법 — 각 키워드의 **검색 피크 이전** 상위 조회 영상들을 받아 게시월(publishedAt)
 * 히스토그램을 만든다. 상위 영상의 게시월이 몰리기 시작한 달 = 콘텐츠 급증 개시.
 * (조회수 상위를 쓰는 이유: 논문 아니고 "화제가 된" 영상의 등장 시점을 보려는 것)
 *
 * 한계 — YouTube totalResults 대신 실제 publishedAt을 쓰므로 신뢰도는 높지만,
 * order=viewCount 표본이라 조회수 낮은 초기 영상은 놓칠 수 있다(개시 시점 과대추정).
 * 즉 "콘텐츠가 앞선다"는 결론에는 보수적이다.
 */

/** 한 달에 이 편수 이상이면 "콘텐츠가 있다"고 인정 (외톨이 1편은 노이즈). */
export const CONTENT_MONTH_FLOOR = 2;

export interface MonthBucket {
  month: string; // YYYY-MM
  count: number;
}

export type ContentVerdict = "content-leads" | "coincident" | "search-leads" | "insufficient";

export interface ContentBacktestResult {
  keyword: string;
  /** 게시월 히스토그램 (연속 월, 빈 달은 0으로 채움) */
  histogram: MonthBucket[];
  sampled: number;
  /** 콘텐츠가 급증하기 시작한 달 (YYYY-MM) */
  onsetMonth: string | null;
  /** 검색 급상승 신호 달 */
  signalMonth: string | null;
  /** 검색 피크 달 */
  peakMonth: string | null;
  /** 콘텐츠 개시 → 검색 신호 (양수 = 콘텐츠가 N개월 앞섬) */
  leadVsSignalMonths: number | null;
  /** 콘텐츠 개시 → 검색 피크 (양수 = 콘텐츠가 N개월 앞섬) */
  leadVsPeakMonths: number | null;
  verdict: ContentVerdict;
}

function monthKey(iso: string): string | null {
  const s = (iso ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function fillMonths(counts: Map<string, number>): MonthBucket[] {
  const keys = [...counts.keys()].sort();
  if (!keys.length) return [];
  const out: MonthBucket[] = [];
  let cur = keys[0];
  const last = keys[keys.length - 1];
  // 안전장치: 최대 60개월까지만 채운다.
  for (let i = 0; i < 60 && monthsBetween(cur, last) >= 0; i += 1) {
    out.push({ month: cur, count: counts.get(cur) ?? 0 });
    const [y, m] = cur.split("-").map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    cur = `${ny}-${String(nm).padStart(2, "0")}`;
  }
  return out;
}

/**
 * 콘텐츠 개시월 = 게시가 몰리기 시작한 첫 달.
 * 최다 게시월을 찾고, 거기서 과거로 걸으며 하한(FLOOR) 미만으로 떨어지는 직전 달까지를
 * "램프"로 보고 그 시작을 개시월로 잡는다. (외톨이 초기 1편에 낚이지 않는다)
 */
function findOnset(histogram: MonthBucket[]): string | null {
  if (!histogram.length) return null;
  let peakIdx = 0;
  for (let i = 1; i < histogram.length; i += 1) {
    if (histogram[i].count > histogram[peakIdx].count) peakIdx = i;
  }
  if (histogram[peakIdx].count < CONTENT_MONTH_FLOOR) return null;
  let onset = peakIdx;
  for (let i = peakIdx - 1; i >= 0; i -= 1) {
    if (histogram[i].count >= CONTENT_MONTH_FLOOR) onset = i;
    else break;
  }
  return histogram[onset].month;
}

export function contentBacktest(
  keyword: string,
  publishedDates: string[],
  signalPeriod: string | null,
  peakPeriod: string | null,
): ContentBacktestResult {
  const counts = new Map<string, number>();
  let sampled = 0;
  for (const iso of publishedDates) {
    const key = monthKey(iso);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    sampled += 1;
  }

  const histogram = fillMonths(counts);
  const onsetMonth = findOnset(histogram);
  const signalMonth = signalPeriod ? signalPeriod.slice(0, 7) : null;
  const peakMonth = peakPeriod ? peakPeriod.slice(0, 7) : null;

  const leadVsSignalMonths =
    onsetMonth && signalMonth ? monthsBetween(onsetMonth, signalMonth) : null;
  const leadVsPeakMonths =
    onsetMonth && peakMonth ? monthsBetween(onsetMonth, peakMonth) : null;

  let verdict: ContentVerdict = "insufficient";
  if (onsetMonth) {
    if (leadVsSignalMonths === null) {
      verdict = "coincident";
    } else if (leadVsSignalMonths >= 1) {
      verdict = "content-leads";
    } else if (leadVsSignalMonths === 0) {
      verdict = "coincident";
    } else {
      verdict = "search-leads";
    }
  }

  return {
    keyword,
    histogram,
    sampled,
    onsetMonth,
    signalMonth,
    peakMonth,
    leadVsSignalMonths,
    leadVsPeakMonths,
    verdict,
  };
}

export interface ContentSummary {
  total: number;
  /** 콘텐츠 개시 시점을 특정한 건수 */
  measured: number;
  /** 콘텐츠가 검색 신호보다 앞선 건수 */
  contentLeads: number;
  /** 검색 피크 대비 중앙 선행(개월) — 양수면 콘텐츠가 그만큼 먼저 */
  medianLeadVsPeak: number | null;
}

export function summarizeContent(results: ContentBacktestResult[]): ContentSummary {
  const measured = results.filter((r) => r.onsetMonth !== null);
  const contentLeads = results.filter((r) => r.verdict === "content-leads");
  const leads = measured
    .map((r) => r.leadVsPeakMonths)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const median = leads.length ? leads[Math.floor((leads.length - 1) / 2)] : null;
  return {
    total: results.length,
    measured: measured.length,
    contentLeads: contentLeads.length,
    medianLeadVsPeak: median,
  };
}

export const CONTENT_VERDICT_META: Record<
  ContentVerdict,
  { label: string; desc: string; tone: "good" | "mid" | "bad" }
> = {
  "content-leads": {
    label: "콘텐츠 선행",
    desc: "SNS 콘텐츠가 검색 급상승보다 먼저 늘기 시작 — 콘텐츠가 조기 신호",
    tone: "good",
  },
  coincident: {
    label: "동시",
    desc: "콘텐츠 급증과 검색 급상승이 같은 달 — 상호 보강",
    tone: "mid",
  },
  "search-leads": {
    label: "검색 선행",
    desc: "검색이 먼저 움직임 — 이 트렌드는 콘텐츠보다 검색이 조기 신호",
    tone: "mid",
  },
  insufficient: {
    label: "표본 부족",
    desc: "게시월이 몰린 구간이 없어 콘텐츠 개시 시점을 특정할 수 없음",
    tone: "bad",
  },
};
