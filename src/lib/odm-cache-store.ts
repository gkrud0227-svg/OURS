import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSupabaseAdmin } from "./supabase";

/**
 * ODM 거래처 카탈로그 캐시 저장소 — Supabase(odm_cache) 또는 로컬 파일(data/odm-cache.json).
 *
 * 매일 크론(/api/odm-cron)이 식약처에서 받아 갱신하고, ODM 라우트가 제한 시간대에 이걸로 응답한다.
 * Supabase 미설정이면 파일로 폴백(기존 scripts/fetch-odm-cache.mjs 와 같은 구조).
 */

export interface OdmCacheEntry {
  total?: number;
  rows?: unknown[]; // 식약처 원본 row (route 가 mapRow 로 변환)
  companies?: string[];
  fetchedAt?: string;
}

const TABLE = "odm_cache";

function filePath(): string {
  const candidates = [
    join(process.cwd(), "data", "odm-cache.json"),
    join(process.cwd(), "trend-dashboard", "data", "odm-cache.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* 다음 후보 */
    }
  }
  return candidates[0];
}

function readFileMap(): Record<string, OdmCacheEntry> {
  try {
    const raw = JSON.parse(readFileSync(filePath(), "utf8")) as { queries?: Record<string, OdmCacheEntry> };
    return raw.queries ?? {};
  } catch {
    return {};
  }
}

/** company 키 → 캐시 엔트리 전체 맵. Supabase 우선, 비었으면 파일 폴백. */
export async function readOdmCacheMap(): Promise<Record<string, OdmCacheEntry>> {
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { data, error } = await sb.from(TABLE).select("company,data");
      if (!error && data && data.length) {
        const map: Record<string, OdmCacheEntry> = {};
        for (const r of data as { company: string; data: OdmCacheEntry }[]) map[r.company] = r.data;
        return map;
      }
    } catch {
      /* Supabase 실패 → 파일 폴백 */
    }
  }
  return readFileMap();
}

/** 퍼지 매칭 — 정확 일치 → 캐시키가 검색어에 포함 → 검색어가 캐시키에 포함. */
function fuzzyMatchKey(keys: string[], company: string): string | null {
  const q = company.toLowerCase();
  return (
    keys.find((k) => k.toLowerCase() === q) ??
    keys.find((k) => q.includes(k.toLowerCase())) ??
    keys.find((k) => k.toLowerCase().includes(q)) ??
    null
  );
}

/**
 * 한 업체의 캐시 엔트리만 효율적으로 조회. (전체 테이블을 받지 않는다 — 동시 9곳 조회 성능)
 * Supabase: 정확 일치 우선 → 없으면 키 목록만 받아 퍼지 매칭 → 그 업체 data 조회. 실패 시 파일 폴백.
 */
export async function readOdmCacheEntry(
  company: string,
): Promise<{ entry: OdmCacheEntry; matchedKey: string } | null> {
  if (!company) return null;
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const exact = await sb.from(TABLE).select("company,data").eq("company", company).maybeSingle();
      if (!exact.error && exact.data) {
        return { entry: (exact.data as { data: OdmCacheEntry }).data, matchedKey: exact.data.company };
      }
      const keysRes = await sb.from(TABLE).select("company");
      if (!keysRes.error && keysRes.data?.length) {
        const k = fuzzyMatchKey((keysRes.data as { company: string }[]).map((r) => r.company), company);
        if (k) {
          const one = await sb.from(TABLE).select("company,data").eq("company", k).maybeSingle();
          if (!one.error && one.data) {
            return { entry: (one.data as { data: OdmCacheEntry }).data, matchedKey: one.data.company };
          }
        }
      }
      // Supabase 에 데이터가 없으면 파일 폴백으로.
    } catch {
      /* Supabase 실패 → 파일 폴백 */
    }
  }
  const map = readFileMap();
  const k = fuzzyMatchKey(Object.keys(map), company);
  return k ? { entry: map[k], matchedKey: k } : null;
}

/** 거래처별 카탈로그를 저장(교체). Supabase 있으면 upsert, 없으면 파일에 병합 저장. */
export async function writeOdmCache(entries: Record<string, OdmCacheEntry>): Promise<void> {
  if (!Object.keys(entries).length) return;
  const sb = getSupabaseAdmin();
  if (sb) {
    const now = new Date().toISOString();
    const rows = Object.entries(entries).map(([company, data]) => ({ company, data, fetched_at: now }));
    const { error } = await sb.from(TABLE).upsert(rows, { onConflict: "company" });
    if (error) throw new Error(`Supabase odm_cache 저장 실패: ${error.message}`);
    return;
  }
  // 파일 폴백 — 기존 구조({ fetchedAt, queries })에 병합.
  const p = filePath();
  const merged = { ...readFileMap(), ...entries };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ fetchedAt: new Date().toISOString(), queries: merged }, null, 2), "utf8");
}
