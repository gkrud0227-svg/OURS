import { NextResponse } from "next/server";
import { KNOWN_PARTNERS } from "@/lib/odm";
import { writeOdmCache, readOdmCacheMap, type OdmCacheEntry } from "@/lib/odm-cache-store";

/**
 * 제조처 카탈로그 매일 갱신 크론.
 *
 * 기존 거래처(KNOWN_PARTNERS)의 제품 리스트를 식약처(I1250)에서 업체명(BSSH_NM) 단독 조회로
 * 받아 캐시에 저장한다.
 *
 * ⚠️ **09~19시(KST)에는 돌려도 소용없다.** 예전 주석은 "업체명 단독 조회는 제한 시간대에도
 *    열려 있다"고 했지만 실측 결과 사실이 아니다 — 필터 없는 조회, BSSH_NM 조회 모두
 *    ERROR-503("09시~19시에는 서비스가 일시적으로 원활하지 않을수있습니다")을 돌려준다.
 *    vercel.json 의 크론 시각은 UTC 이므로 09~19시 KST(= 00~10시 UTC)를 피해서 잡을 것.
 *    현재 "0 13 * * *" = 22시 KST 로 안전하다.
 *
 * ⚠️ **오래된 것부터 순회한다.** 거래처가 63곳이고 대형 업체는 3천~4천건(수십 페이지)이라
 *    한 번에 전부 받으면 Vercel Hobby 상한(60초)을 넘긴다. 예전 구현은 매 실행마다 배열
 *    처음부터 돌아서 앞쪽 몇 곳만 매일 다시 받고 **뒤쪽은 영영 도달하지 못했다**.
 *    이제 캐시의 fetchedAt 이 가장 오래된(또는 없는) 곳부터 처리하고, 시간 예산이 다하면
 *    멈춘다. 다음 실행이 그다음 오래된 곳을 집으므로 며칠에 걸쳐 전체가 한 바퀴 돈다.
 *    한 바퀴를 빨리 돌리려면 vercel.json 의 크론 빈도를 올리면 된다.
 *
 * 저장은 odm-cache-store 가 담당(Supabase 우선, 없으면 파일). 제조처 라우트가 같은 캐시를 읽는다.
 * 보호: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 요구(Vercel 크론이 자동 첨부).
 */

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I1250";
const MAX_ROWS = 5000; // 업체당 최대 수집(전체 품목 확보 — 대형 거래처 3천~4천건 대응)
const CHUNK = 100; // 식약처 1회 페이지 크기(요청당 최대)

export const maxDuration = 60; // Hobby 플랜 상한(60초). Pro면 300까지 가능.
/**
 * 실제로 일할 시간 예산(ms). maxDuration 보다 짧게 둬서, 강제 종료 대신 스스로 멈추고
 * 어디까지 했는지 응답으로 남기게 한다. 강제 종료되면 진행 상황을 알 수 없다.
 */
const TIME_BUDGET_MS = 50_000;

interface RawRow {
  BSSH_NM?: string;
  [k: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 09~19시 KST 제한 시간대. 순회를 계속해봐야 전부 실패하므로 즉시 멈추는 신호로 쓴다. */
class RestrictedHoursError extends Error {}

/** 식약처 한 페이지(start~end) 1회 조회. */
async function fetchPageOnce(
  key: string,
  company: string,
  start: number,
  end: number,
): Promise<{ rows: RawRow[]; total: number; ok: boolean; restricted?: boolean }> {
  const url = `${BASE}/${key}/${SERVICE}/json/${start}/${end}/BSSH_NM=${encodeURIComponent(company)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!res.ok) return { rows: [], total: 0, ok: false };
    const json = (await res.json()) as Record<
      string,
      { row?: RawRow[]; total_count?: string | number; RESULT?: { CODE?: string } }
    >;
    const env = json?.[SERVICE];
    const code = env?.RESULT?.CODE ?? "";
    // INFO-200 = 해당 구간 데이터 없음(정상 끝). 그 외 코드는 일시 오류로 보고 재시도 대상.
    const ok = !code || code.startsWith("INFO-000") || code.startsWith("INFO-200");
    // 더 돌려봐야 소용없는 두 경우를 하나로 묶는다.
    //   ERROR-503 — 제한 시간대(09~19시 KST)
    //   INFO-320  — 시간당 호출 한도(CHNG_DT 없이 쓰면 1시간에 100회)
    // 실측: 대형 거래처는 100건씩 페이징하느라 호출을 수십 번 써서, 40곳쯤에서 한도에 걸린다.
    // 예전엔 이걸 그냥 실패로 처리해 다음 회차마다 같은 곳을 헛돌았다.
    const restricted = code.startsWith("ERROR-503") || code.startsWith("INFO-320");
    return { rows: env?.row ?? [], total: Number(env?.total_count ?? 0) || 0, ok, restricted };
  } catch {
    return { rows: [], total: 0, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** 빈/오류 응답이면 재시도(식약처 일시 rate-limit 대응). */
async function fetchPage(
  key: string,
  company: string,
  start: number,
  end: number,
): Promise<{ rows: RawRow[]; total: number; restricted?: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchPageOnce(key, company, start, end);
    // 제한 시간대는 기다린다고 풀리지 않는다. 재시도 없이 즉시 올려보낸다.
    if (r.restricted) return { rows: [], total: 0, restricted: true };
    if (r.ok && (r.rows.length > 0 || r.total === 0)) return { rows: r.rows, total: r.total };
    await sleep(400 * (attempt + 1)); // 점증 backoff
  }
  return { rows: [], total: 0 };
}

/** 동시 요청 수 제한 — 식약처가 과도한 병렬을 rate-limit(빈 응답)하므로 소량만 병렬. */
const PAGE_CONCURRENCY = 3;

async function fetchCompany(key: string, company: string): Promise<OdmCacheEntry> {
  // 1) 첫 페이지로 전체 건수(total) 파악.
  const first = await fetchPage(key, company, 1, CHUNK);
  if (first.restricted) throw new RestrictedHoursError();
  const total = first.total || first.rows.length;
  const cap = Math.min(total, MAX_ROWS);
  const rows: RawRow[] = [...first.rows];

  // 2) 나머지 페이지를 **동시 4개씩** 받는다 — 순차보다 빠르고(60초 대응),
  //    전부 병렬(30+개)이면 식약처가 rate-limit해서 데이터가 비니 소량 병렬로 균형.
  const ranges: Array<[number, number]> = [];
  for (let start = CHUNK + 1; start <= cap; start += CHUNK) {
    ranges.push([start, Math.min(start + CHUNK - 1, cap)]);
  }
  let idx = 0;
  async function worker() {
    while (idx < ranges.length) {
      const [s, e] = ranges[idx++];
      const p = await fetchPage(key, company, s, e);
      rows.push(...p.rows);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, ranges.length) }, worker));

  const companies = [...new Set(rows.map((x) => (x.BSSH_NM ?? "").trim()).filter(Boolean))];
  return { total: total || rows.length, rows, companies, fetchedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.FOODSAFETY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "FOODSAFETY_API_KEY 미설정", needsKey: true }, { status: 400 });
  }

  const startedAt = Date.now();
  const at = new Date().toISOString();
  const done: string[] = [];
  const failed: string[] = [];

  // 갱신이 가장 오래된 거래처부터. 캐시에 없는 곳(한 번도 못 받은 곳)이 가장 먼저 온다.
  const cache = await readOdmCacheMap().catch(() => ({} as Record<string, OdmCacheEntry>));
  const staleness = (c: string) => {
    const t = cache[c]?.fetchedAt;
    return t ? Date.parse(t) || 0 : 0; // 없으면 0 = 가장 오래됨
  };
  const queue = [...KNOWN_PARTNERS].sort((a, b) => staleness(a) - staleness(b));

  // 거래처별로 받는 즉시 저장한다 — 예산이 다해 중간에 멈춰도 완료분은 남고,
  // 다음 실행이 그다음 오래된 곳을 집는다.
  let stoppedFor: string | null = null;
  for (const company of queue) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      stoppedFor = company;
      break;
    }
    try {
      const entry = await fetchCompany(key, company);
      if ((entry.rows?.length ?? 0) > 0) {
        await writeOdmCache({ [company]: entry });
        done.push(`${company}:${entry.total}건`);
      } else {
        failed.push(company);
      }
    } catch (e) {
      if (e instanceof RestrictedHoursError) {
        return NextResponse.json({
          ok: false,
          at,
          restricted: true,
          error:
            "식품안전나라 조회가 막혔습니다 — 제한 시간대(09~19시 KST)이거나 시간당 호출 한도(100회)에 걸렸습니다. 한 시간 뒤 또는 19시 이후에 다시 실행하세요.",
          elapsedMs: Date.now() - startedAt,
          updated: done.length,
          done,
        });
      }
      failed.push(company);
    }
  }

  const covered = KNOWN_PARTNERS.filter((c) => cache[c] || done.some((d) => d.startsWith(`${c}:`)));
  return NextResponse.json({
    ok: true,
    at,
    elapsedMs: Date.now() - startedAt,
    partners: KNOWN_PARTNERS.length,
    // 한 바퀴 진행률 — 캐시에 한 번이라도 담긴 거래처 수.
    cached: covered.length,
    updated: done.length,
    done,
    failed,
    // 예산이 다해 멈췄다면 다음 실행이 여기서부터 이어받는다.
    ...(stoppedFor ? { stoppedBudgetAt: stoppedFor } : {}),
  });
}
