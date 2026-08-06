import { NextResponse } from "next/server";
import { KNOWN_PARTNERS } from "@/lib/odm";
import { writeOdmCache, type OdmCacheEntry } from "@/lib/odm-cache-store";

/**
 * ODM 거래처 카탈로그 매일 갱신 크론.
 *
 * 기존 거래처(KNOWN_PARTNERS)의 제품 리스트를 식약처(I1250)에서 업체명(BSSH_NM) 단독 조회로
 * 받아 캐시에 저장한다. 업체명 단독 조회는 제한 시간대(09~19시)에도 열려 있어 언제 돌려도 된다.
 *
 * 저장은 odm-cache-store 가 담당(Supabase 우선, 없으면 파일). ODM 라우트가 같은 캐시를 읽는다.
 * 보호: CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 요구(Vercel 크론이 자동 첨부).
 */

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I1250";
const MAX_ROWS = 5000; // 업체당 최대 수집(전체 품목 확보 — 대형 거래처 3천~4천건 대응)
const CHUNK = 100; // 식약처 1회 페이지 크기(요청당 최대)

export const maxDuration = 60; // Hobby 플랜 상한(60초). Pro면 300까지 가능.

interface RawRow {
  BSSH_NM?: string;
  [k: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 식약처 한 페이지(start~end) 1회 조회. */
async function fetchPageOnce(
  key: string,
  company: string,
  start: number,
  end: number,
): Promise<{ rows: RawRow[]; total: number; ok: boolean }> {
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
    return { rows: env?.row ?? [], total: Number(env?.total_count ?? 0) || 0, ok };
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
): Promise<{ rows: RawRow[]; total: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchPageOnce(key, company, start, end);
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

  const at = new Date().toISOString();
  const done: string[] = [];
  const failed: string[] = [];

  // 거래처별로 받는 즉시 저장한다 — Hobby 60초 제한에 걸려 중간에 끊겨도 완료분은 유지되고,
  // 다음 실행이 나머지를 이어받는다(upsert). 이미 최신인 곳은 그대로 덮어써도 무방.
  for (const company of KNOWN_PARTNERS) {
    try {
      const entry = await fetchCompany(key, company);
      if ((entry.rows?.length ?? 0) > 0) {
        await writeOdmCache({ [company]: entry });
        done.push(`${company}:${entry.total}건`);
      } else {
        failed.push(company);
      }
    } catch {
      failed.push(company);
    }
  }

  return NextResponse.json({ ok: true, at, updated: done.length, done, failed });
}
