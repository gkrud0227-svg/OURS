import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSupabaseAdmin } from "./supabase";
import type { TermHistory } from "./news-novelty";

/**
 * 식품 뉴스 스캔 이력 저장소 — Supabase(news_history) 또는 로컬 파일(data/news-history-*.json).
 *
 * ⚠️ **왜 파일만으로는 안 되는가**: 이 이력은 매일 크론이 쌓아야 의미가 생긴다(RSS 는 최신
 *    며칠치만 주므로 "한 달치"는 누적으로만 만들어진다). 그런데 Vercel 함수의 파일시스템은
 *    /tmp 를 빼면 읽기 전용이고, /tmp 도 인스턴스가 죽으면 사라진다. 파일에만 쓰면 크론이
 *    매일 돌아도 기준선이 매번 비어 있어 **모든 용어가 new 로 나온다** — 랭킹이 무의미해진다.
 *    그래서 odm_cache 와 같은 방식으로 Supabase 를 1순위로 둔다.
 *
 * 구분(region)당 한 행에 맵 전체를 담는다. 용어당 한 행으로 쪼개지 않는 이유는 한 번에
 * 전부 읽고 전부 쓰는 접근 패턴이라 쪼갤 이득이 없고, 쓰기가 9천 건으로 늘기 때문이다.
 */

const TABLE = "news_history";

export type HistoryMap = Record<string, TermHistory>;

function filePath(region?: string): string {
  const name = region ? `news-history-${region}.json` : "news-history.json";
  const candidates = [
    join(process.cwd(), "data", name),
    join(process.cwd(), "trend-dashboard", "data", name),
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

function readFileHistory(region?: string): HistoryMap {
  try {
    return JSON.parse(readFileSync(filePath(region), "utf8")) as HistoryMap;
  } catch {
    return {};
  }
}

/** 이력 읽기. Supabase 우선, 비었거나 실패하면 파일 폴백. */
export async function readNewsHistory(region?: string): Promise<HistoryMap> {
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { data, error } = await sb
        .from(TABLE)
        .select("data")
        .eq("region", region ?? "all")
        .maybeSingle();
      if (!error && data) return ((data as { data: HistoryMap }).data ?? {}) as HistoryMap;
    } catch {
      /* Supabase 실패 → 파일 폴백 */
    }
  }
  return readFileHistory(region);
}

/** 이력 저장(교체). Supabase 있으면 upsert, 없으면 파일. 실패해도 스캔 결과는 살린다. */
export async function writeNewsHistory(history: HistoryMap, region?: string): Promise<void> {
  if (!Object.keys(history).length) return;
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { error } = await sb
        .from(TABLE)
        .upsert(
          { region: region ?? "all", data: history, fetched_at: new Date().toISOString() },
          { onConflict: "region" },
        );
      if (!error) return;
    } catch {
      /* Supabase 실패 → 파일 폴백 */
    }
  }
  try {
    const p = filePath(region);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(history, null, 2));
  } catch {
    /* 이력 저장 실패해도 스캔 결과는 반환한다 */
  }
}
