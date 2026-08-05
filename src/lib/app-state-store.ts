import { getSupabaseAdmin } from "./supabase";

/**
 * 범용 앱 상태 저장소 — Supabase app_state(key, data jsonb).
 * 시드 등 작은 설정값을 key별로 영속화. 미설정이면 null(클라이언트가 localStorage 폴백).
 */

const TABLE = "app_state";

export async function readState<T>(key: string): Promise<T | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("data").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase app_state 읽기 실패(${key}): ${error.message}`);
  return (data?.data as T | undefined) ?? null;
}

export async function writeState(key: string, data: unknown): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return; // 미설정이면 no-op(localStorage 가 유지)
  const { error } = await sb
    .from(TABLE)
    .upsert({ key, data, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Supabase app_state 저장 실패(${key}): ${error.message}`);
}
