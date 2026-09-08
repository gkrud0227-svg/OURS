/**
 * 라벨링 실행부 — 로그(또는 임의 입력)를 데이터랩으로 되짚어 hit/dud 판정한다.
 * 라벨 API(/api/discovery-label)와 가중치 API(/api/signal-weights)가 공유한다.
 *
 * 데이터랩 주간 곡선을 term별 **단독 조회**(묶음 금지 — 정규화 왜곡 방지)해 labelEntry로 판정.
 */
import type { WeekPoint } from "./types";
import { readLog, writeLabels, type LabelPatch } from "./discovery-log-store";
import { labelEntry, type LabelInput, type LabelResult } from "./discovery-label";

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";
/**
 * 1회 처리 상한. 데이터랩을 term 마다 단독 조회해야 해서 건당 4초쯤 걸린다(실측:
 * 30건 123초). 서버리스 함수 시간 제한에 걸리지 않도록 기본값을 작게 두고,
 * 전체를 훑을 때는 호출 쪽에서 max 를 올려 배치로 나눠 돈다.
 */
const MAX_TERMS = 30;
const PREROLL_DAYS = 84; // 발견 이전 12주 warmup(4주 MA가 발견 직후 작동)
/**
 * 데이터랩 한 건 타임아웃(ms).
 * ⚠️ 없으면 응답 없는 연결 하나에 배치 전체가 멈춘다 — 실제로 405건 판정이 첫 배치에서
 *    10분 넘게 멈춰 있었다. 판정 못 한 건은 곡선 없음으로 처리되어 pending 이 되니,
 *    끊는 편이 통째로 서는 것보다 낫다.
 */
const WEEKS_MS = 15_000;
/** 연속 호출 사이 간격(ms) — 데이터랩 속도 제한에 걸리지 않게 한 박자 쉰다. */
const GAP_MS = 120;

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
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), WEEKS_MS);
  try {
    return await requestWeeks(keyword, startDate, endDate, clientId, clientSecret, ac.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function requestWeeks(
  keyword: string,
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
  signal: AbortSignal,
): Promise<WeekPoint[]> {
  const res = await fetch(ENDPOINT, {
    signal,
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
  opts: { max?: number } = {},
): Promise<{ results: LabelResult[]; error?: string }> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { results: [], error: "네이버 데이터랩 API 키가 설정되지 않았습니다." };
  }
  const endDate = fmt(new Date());
  const results: LabelResult[] = [];
  for (const inp of inputs.slice(0, opts.max ?? MAX_TERMS)) {
    const seen = new Date(inp.firstSeenAt);
    const start = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate() - PREROLL_DAYS);
    let weeks: WeekPoint[] = [];
    try {
      weeks = await fetchWeeks(inp.term, fmt(start), endDate, clientId, clientSecret);
    } catch {
      weeks = [];
    }
    results.push(labelEntry(inp, weeks));
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return { results };
}

/**
 * 전향적 로그를 라벨링 입력으로 변환.
 * @param opts.onlyUnlabeled 아직 판정 안 한 후보만(label 이 null). 이어서 돌릴 때 쓴다.
 *   ⚠️ "pending"(관측 창이 안 지남)은 판정을 **시도한** 것이라 제외되지 않는다 — 창이
 *      지나면 다시 봐야 하므로, 재판정은 onlyUnlabeled 를 끄고 돌린다.
 */
export async function readLogAsInputs(
  opts: { onlyUnlabeled?: boolean } = {},
): Promise<LabelInput[]> {
  const entries = await readLog();
  return entries
    .filter((e) => e.term && e.firstSeenAt)
    .filter((e) => !opts.onlyUnlabeled || e.label == null)
    .map((e) => ({
      term: e.term,
      firstSeenAt: e.firstSeenAt,
      source: e.source,
      novel: e.novel,
      lift: e.lift,
    }));
}

/** LabelResult 를 로그에 눌러 담을 형태로 줄인다. */
function toPatch(r: LabelResult): LabelPatch {
  return {
    term: r.term,
    label: r.label,
    observedWeeks: r.observedWeeks,
    peakRise: r.riseAfterPct,
    reason: r.reason,
  };
}

/**
 * 아직 판정 안 한 후보를 batch 만큼 라벨링하고 **결과를 로그에 저장**한다.
 *
 * 저장이 핵심이다 — 예전엔 판정만 하고 버려서, 화면을 닫으면 405건을 처음부터 다시
 * 조회해야 했다(건당 4초). 그래서 실제로 한 번도 완주하지 못했다.
 *
 * @returns 이번에 판정한 결과와, 아직 남은 미판정 건수
 */
export async function labelAndStore(
  batch: number,
): Promise<{ results: LabelResult[]; saved: number; remaining: number; error?: string }> {
  const pending = await readLogAsInputs({ onlyUnlabeled: true });
  if (!pending.length) return { results: [], saved: 0, remaining: 0 };
  const { results, error } = await labelInputs(pending, { max: batch });
  if (error) return { results: [], saved: 0, remaining: pending.length, error };
  const saved = await writeLabels(results.map(toPatch), new Date().toISOString());
  return { results, saved, remaining: pending.length - results.length };
}
