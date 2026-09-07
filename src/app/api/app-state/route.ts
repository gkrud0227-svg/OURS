import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/app-state-store";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * 범용 앱 상태 API — 시드 등 작은 설정값 영속화.
 *  - GET ?key=seeds        : 저장된 값. persisted=false 면 클라이언트가 localStorage 폴백.
 *  - PUT {key, data}       : 저장(교체).
 *
 * key 는 화이트리스트로 제한(임의 쓰기 방지).
 *
 * 'discovery' 는 발굴 결과 묶음(국내·해외 후보 · 확산 흐름 · 근거 · 마지막 발굴시각).
 * ⚠️ 다섯 조각을 한 key 에 함께 둔다. 발굴 한 번에 같이 쓰이고 같이 읽히는 값이라
 *    나누면 쓰기만 다섯 배가 되고, 조각끼리 시점이 어긋나 "후보는 새 건데 흐름은 옛것"
 *    같은 상태가 생긴다.
 */

const ALLOWED = new Set(["seeds", "overseas_seeds", "discovery"]);

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: "허용되지 않은 key 입니다." }, { status: 400 });
  }
  try {
    const data = await readState<unknown>(key);
    return NextResponse.json({ key, data, persisted: isSupabaseConfigured() });
  } catch (e) {
    // 읽기 실패해도 앱이 죽지 않게 — persisted=false 로 폴백 유도.
    return NextResponse.json({
      key,
      data: null,
      persisted: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function PUT(request: Request) {
  let body: { key?: string; data?: unknown };
  try {
    body = (await request.json()) as { key?: string; data?: unknown };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  if (!body.key || !ALLOWED.has(body.key)) {
    return NextResponse.json({ error: "허용되지 않은 key 입니다." }, { status: 400 });
  }
  try {
    await writeState(body.key, body.data ?? null);
    return NextResponse.json({ ok: true, persisted: isSupabaseConfigured() });
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
