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

async function fetchCompany(key: string, company: string): Promise<OdmCacheEntry> {
  const rows: RawRow[] = [];
  let total = 0;
  for (let start = 1; start <= MAX_ROWS; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, MAX_ROWS);
    const url = `${BASE}/${key}/${SERVICE}/json/${start}/${end}/BSSH_NM=${encodeURIComponent(company)}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let batch: RawRow[] = [];
    try {
      const res = await fetch(url, { cache: "no-store", signal: ac.signal });
      if (!res.ok) break;
      const json = (await res.json()) as Record<string, { row?: RawRow[]; total_count?: string | number }>;
      const env = json?.[SERVICE];
      batch = env?.row ?? [];
      total = Number(env?.total_count ?? 0) || total;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
    rows.push(...batch);
    if (batch.length < end - start + 1 || rows.length >= total) break;
  }
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
