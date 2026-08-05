import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 관리자 클라이언트.
 *
 * 전향적 발굴 로그는 **서버 Route Handler에서만** 읽고 쓴다(브라우저 접근 없음).
 * 그래서 서비스 롤 키를 쓰고, 테이블은 RLS로 잠근다(브라우저 publishable 키엔 정책 없음).
 *
 * env(NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)가 없으면 **null**을 돌려주고,
 * 호출부는 로컬 파일로 폴백한다 — 키 없이도 로컬 개발이 그대로 돌아간다.
 */

let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !rawKey) {
    cached = null;
    return null;
  }
  // 흔한 붙여넣기 실수 보정: 앞뒤 따옴표/공백, 끝 슬래시, 실수로 붙인 /rest/v1 제거.
  // (이걸 안 벗기면 "Invalid path specified in request URL" 오류가 난다)
  let url = rawUrl.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
  if (url.endsWith("/rest/v1")) url = url.slice(0, -"/rest/v1".length).replace(/\/+$/, "");
  cached = createClient(url, rawKey.trim(), { auth: { persistSession: false } });
  return cached;
}

/** Supabase가 설정돼 있으면 true(영속화 켜짐), 아니면 false(파일 폴백). */
export function isSupabaseConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}
