import { getSupabaseAdmin } from "./supabase";
import type { Keyword } from "./types";

/**
 * 저장한 후보(watchlist) 서버 저장소 — Supabase 단일 행(id='current')에 전체 목록을 jsonb 로.
 *
 * Supabase 미설정이면 null 을 돌려주고, 클라이언트는 localStorage 로 폴백한다.
 * (localStorage 는 오프라인 캐시 겸 폴백으로 계속 유지된다)
 */

const TABLE = "watchlist";
const ROW_ID = "current";

/** null = Supabase 미설정(폴백하라는 신호). 배열 = 저장된 목록(빈 배열 포함). */
export async function readWatchlist(): Promise<Keyword[] | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("data").eq("id", ROW_ID).maybeSingle();
  if (error) throw new Error(`Supabase watchlist 읽기 실패: ${error.message}`);
  return (data?.data as Keyword[] | undefined) ?? [];
}

export async function writeWatchlist(keywords: Keyword[]): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return; // 미설정이면 no-op(클라이언트가 localStorage 로 유지)
  const { error } = await sb
    .from(TABLE)
    .upsert({ id: ROW_ID, data: keywords, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Supabase watchlist 저장 실패: ${error.message}`);
}
