/**
 * 식약처 **일일 변경분(CHNG_DT)** 수집 — 협력 제조처 캐시를 매일 최신으로 유지한다.
 *
 * ⚠️ 왜 이 방식인가 (실측으로 확인한 것)
 *   기존 방식은 업체마다 전체 목록을 통째로 받는다(삼립 3,306건 → 34회 호출). 64곳을 다
 *   돌면 시간당 한도 100회에 40곳쯤에서 걸리고, 50초 예산 안에 5곳밖에 못 한다. 한 바퀴에
 *   약 13일 — "매일 최신"이 구조적으로 불가능했다.
 *
 *   그런데 식약처는 CHNG_DT(변경일자) 조회를 **시간당 한도에서 빼준다**. 같은 순간에
 *   측정한 결과:
 *       CHNG_DT=20260907   INFO-000  정상 (1,292건)
 *       BSSH_NM=삼립        INFO-320  "CHNG_DT 파라미터를 사용하지 않으면 1시간당 100회"
 *
 *   하루치 변경분은 1,300~2,400건이라 100건씩 13~24회면 끝난다. 업체를 지정하지 않고
 *   그날 바뀐 것을 통째로 받아 우리 거래처 것만 걸러내면, 64곳이 **한 번에** 최신이 된다.
 *
 * ⚠️ 제한 시간대(09~19시 KST)에는 CHNG_DT 조회도 **똑같이 막힌다**(실측: 09:01 에
 *    ERROR-503 "09시~19시에는 서비스가 제한됩니다"). 한도만 면제될 뿐 시간 제한은 그대로다.
 *    그러니 크론은 반드시 그 시간 밖에 돌아야 한다 — 현재 22:00 KST.
 *    Vercel Hobby 크론은 지정 시각에 정확히 돌지 않고 그 시간대 안에서 흔들리므로,
 *    08:00 처럼 09:00 에 붙은 시각은 위험하다. 22:00 은 다음 제한까지 11시간 여유가 있다.
 * ⚠️ 막힌 날은 lastDate 를 올리지 않아 다음 실행이 다시 시도한다. 놓친 날짜는 최대
 *    MAX_CATCHUP_DAYS 일까지 따라잡는다.
 */

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I1250";
/**
 * 1회 페이지 크기. 식약처 상한은 **1000**이다(실측: 1/1000 정상, 1/2000 은 ERROR-336
 * "한번에 최대 1000건"). 하루치 1,292건이 두 번이면 끝난다.
 *
 * ⚠️ 100씩 쪼개 병렬로 받으려던 게 실수였다. 식약처는 과도한 병렬에 **빈 봉투**를 돌려주고
 *    (오류가 아니라 조용히 빈다) 재시도로 메우려니 53초에 900/1292 밖에 못 받았다.
 *    큰 페이지를 순차로 받는 편이 훨씬 빠르고 안정적이다.
 */
const CHUNK = 1000;
/** 하루치 변경분 상한 — 실측 1,300~2,400건이라 넉넉하다. 폭주 시 무한 페이징을 막는다. */
const MAX_ROWS_PER_DAY = 6000;
/** 한 번에 따라잡을 최대 날짜 수 — 크론이 며칠 걸러도 메우되, 시간 예산을 넘기지 않는다. */
export const MAX_CATCHUP_DAYS = 7;
/**
 * 동시 페이지 요청 수. 1000건 페이지라 하루치가 두 장이면 끝나므로 병렬이 거의 의미가
 * 없고, 병렬이 오히려 빈 응답을 유발한다. 그래서 **순차**로 둔다.
 */
const PAGE_CONCURRENCY = 1;

export interface DeltaRow {
  /** 품목보고번호 — 병합 시 중복 판정 키. */
  PRDLST_REPORT_NO?: string;
  BSSH_NM?: string;
  [k: string]: unknown;
}

/** KST 기준 YYYYMMDD. 식약처 날짜는 한국 시간이다. */
export function kstYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600e3);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** YYYYMMDD 다음 날. */
export function nextYmd(ymd: string): string {
  const d = new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)) + 1,
  );
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

interface PageResult {
  rows: DeltaRow[];
  total: number;
  /** 더 받아봐야 소용없는 상태(제한 시간대 등). */
  blocked: boolean;
}

async function fetchPageOnce(key: string, date: string, start: number, end: number): Promise<PageResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const url = `${BASE}/${key}/${SERVICE}/json/${start}/${end}/CHNG_DT=${date}`;
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!res.ok) return { rows: [], total: 0, blocked: false };
    const json = (await res.json()) as Record<
      string,
      { row?: DeltaRow[]; total_count?: string | number; RESULT?: { CODE?: string } }
    >;
    const env = json?.[SERVICE];
    const code = env?.RESULT?.CODE ?? "";
    // ERROR-503 = 제한 시간대, INFO-320 = 시간당 한도. 더 눌러도 소용없다.
    const blocked = code.startsWith("ERROR-503") || code.startsWith("INFO-320");
    return { rows: env?.row ?? [], total: Number(env?.total_count ?? 0) || 0, blocked };
  } catch {
    return { rows: [], total: 0, blocked: false };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 빈/오류 응답이면 재시도한다.
 *
 * ⚠️ 이게 없으면 조용히 반쪽만 받는다. 실측: 동시 4개로 1,292건을 받으니 13페이지 중
 *    3페이지만 채워지고 300건에서 멈췄다 — 오류가 아니라 **빈 응답**이라 실패로도 안 잡힌다.
 *    식약처는 과도한 병렬을 이렇게 흘려보낸다. 기존 업체별 조회에는 있던 장치인데
 *    변경분 쪽에 빠져 있었다.
 */
async function fetchPage(
  key: string,
  date: string,
  start: number,
  end: number,
): Promise<PageResult> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const r = await fetchPageOnce(key, date, start, end);
    if (r.blocked) return r; // 제한 시간대·한도는 기다려도 안 풀린다
    if (r.rows.length > 0) return r;
    // ⚠️ total === 0 을 "정상적으로 빈 구간"으로 보고 즉시 반환하면 안 된다. 병렬 제한에
    //    걸린 응답도 봉투가 비어 total 이 0 으로 읽히기 때문이다 — 실측에서 이 조건 때문에
    //    13페이지 중 3페이지만 받고 300/1292 로 끝났다. 요청 구간은 첫 페이지에서 확인한
    //    total 안쪽이므로 **비어 있으면 무조건 이상**이다. 끝까지 재시도한다.
    await sleep(500 * (attempt + 1)); // 점증 backoff
  }
  return { rows: [], total: 0, blocked: false };
}

/**
 * 하루치 변경분 전체를 받는다.
 * @param deadline 이 시각을 넘으면 받은 데까지만 돌려준다(크론 시간 예산).
 */
export async function fetchDeltaDay(
  key: string,
  date: string,
  deadline: number,
): Promise<{ rows: DeltaRow[]; total: number; complete: boolean; blocked: boolean }> {
  const first = await fetchPage(key, date, 1, CHUNK);
  if (first.blocked) return { rows: [], total: 0, complete: false, blocked: true };
  const total = first.total || first.rows.length;
  const cap = Math.min(total, MAX_ROWS_PER_DAY);
  const rows = [...first.rows];

  // 남은 페이지(1000행 단위라 보통 한 장)를 받는다.
  // 워커 구조를 남겨둔 건 하루치가 폭증했을 때 PAGE_CONCURRENCY 만 올리면 되게 하려는 것이다.
  const ranges: Array<[number, number]> = [];
  for (let start = CHUNK + 1; start <= cap; start += CHUNK) {
    ranges.push([start, Math.min(start + CHUNK - 1, cap)]);
  }
  let idx = 0;
  let blocked = false;
  let ranOut = false;
  async function worker() {
    while (idx < ranges.length) {
      if (Date.now() > deadline) {
        ranOut = true;
        return;
      }
      const [s, e] = ranges[idx++];
      const p = await fetchPage(key, date, s, e);
      if (p.blocked) {
        blocked = true;
        return;
      }
      rows.push(...p.rows);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, ranges.length) }, worker));
  if (blocked) return { rows, total, complete: false, blocked: true };
  if (ranOut) return { rows, total, complete: false, blocked: false };

  return { rows, total, complete: rows.length >= cap, blocked: false };
}

/**
 * 변경분 행들을 거래처별로 가른다.
 *
 * ⚠️ 식약처는 업체를 길게 등록한다("에스피씨삼립(주) 대구공장"). 기존 BSSH_NM= 조회가
 *    부분 매칭이었으므로 여기서도 **포함 관계**로 맞춰야 결과가 달라지지 않는다.
 */
export function groupByPartner(
  rows: DeltaRow[],
  partners: string[],
  aliases: Record<string, string[]> = {},
): Map<string, DeltaRow[]> {
  const out = new Map<string, DeltaRow[]>();
  const needles = partners.map((p) => ({ partner: p, terms: [p, ...(aliases[p] ?? [])] }));
  for (const r of rows) {
    const name = (r.BSSH_NM ?? "").trim();
    if (!name) continue;
    for (const { partner, terms } of needles) {
      if (terms.some((t) => name.includes(t))) {
        const list = out.get(partner) ?? [];
        list.push(r);
        out.set(partner, list);
        break; // 한 행은 한 거래처에만 — 상호가 겹치는 경우 목록 순서가 우선한다.
      }
    }
  }
  return out;
}

/**
 * 기존 캐시 행에 변경분을 병합한다(품목보고번호 기준 갱신, 없으면 추가).
 * @returns 병합된 전체 행과, 새로 추가된 건수
 */
export function mergeRows(
  existing: DeltaRow[],
  incoming: DeltaRow[],
): { rows: DeltaRow[]; added: number; updated: number } {
  const byNo = new Map<string, number>();
  const rows = [...existing];
  rows.forEach((r, i) => {
    const no = String(r.PRDLST_REPORT_NO ?? "").trim();
    if (no) byNo.set(no, i);
  });

  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    const no = String(r.PRDLST_REPORT_NO ?? "").trim();
    // 보고번호가 없으면 갱신 여부를 알 수 없다 — 중복을 만드느니 버린다.
    if (!no) continue;
    const at = byNo.get(no);
    if (at === undefined) {
      byNo.set(no, rows.length);
      rows.push(r);
      added += 1;
    } else {
      rows[at] = r;
      updated += 1;
    }
  }
  return { rows, added, updated };
}
