/**
 * 라벨링 실행부 — 로그(또는 임의 입력)를 데이터랩으로 되짚어 hit/dud 판정한다.
 * 라벨 API(/api/discovery-label)와 가중치 API(/api/signal-weights)가 공유한다.
 *
 * 데이터랩 주간 곡선을 term별 **단독 조회**(묶음 금지 — 정규화 왜곡 방지)해 labelEntry로 판정.
 */
import type { WeekPoint } from "./types";
import { readLog } from "./discovery-log-store";
import { labelEntry, type LabelInput, type LabelResult } from "./discovery-label";

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";
const MAX_TERMS = 30; // 1회 처리 상한(데이터랩 호출 수 제한)
const PREROLL_DAYS = 84; // 발견 이전 12주 warmup(4주 MA가 발견 직후 작동)

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchWeeks(
  keyword: string,
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
): Promise<WeekPoint[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      timeUnit: "week",
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: { data?: { period: string; ratio: number }[] }[];
  };
  const data = json.results?.[0]?.data ?? [];
  return data.map((d) => ({ period: d.period, ratio: d.ratio }));
}

/** 입력 후보들을 데이터랩으로 라벨링. 키가 없으면 error. */
export async function labelInputs(
  inputs: LabelInput[],
): Promise<{ results: LabelResult[]; error?: string }> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { results: [], error: "네이버 데이터랩 API 키가 설정되지 않았습니다." };
  }
  const endDate = fmt(new Date());
  const results: LabelResult[] = [];
  for (const inp of inputs.slice(0, MAX_TERMS)) {
    const seen = new Date(inp.firstSeenAt);
    const start = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate() - PREROLL_DAYS);
    let weeks: WeekPoint[] = [];
    try {
      weeks = await fetchWeeks(inp.term, fmt(start), endDate, clientId, clientSecret);
    } catch {
      weeks = [];
    }
    results.push(labelEntry(inp, weeks));
  }
  return { results };
}

/** 전향적 로그 전체를 읽어 라벨링 입력으로 변환. */
export async function readLogAsInputs(): Promise<LabelInput[]> {
  const entries = await readLog();
  return entries
    .filter((e) => e.term && e.firstSeenAt)
    .map((e) => ({
      term: e.term,
      firstSeenAt: e.firstSeenAt,
      source: e.source,
      novel: e.novel,
      lift: e.lift,
    }));
}
