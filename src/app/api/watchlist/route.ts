import { NextResponse } from "next/server";
import { readWatchlist, writeWatchlist } from "@/lib/watchlist-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Keyword } from "@/lib/types";

/**
 * 저장한 후보(watchlist) 영속화 API.
 *  - GET : 서버에 저장된 목록. persisted=false 면 클라이언트가 localStorage 로 폴백.
 *  - PUT : 전체 목록을 저장(교체).
 */

export async function GET() {
  try {
    const keywords = await readWatchlist();
    return NextResponse.json({ keywords, persisted: isSupabaseConfigured() });
  } catch (e) {
    // 읽기 실패해도 앱이 죽지 않게 — 클라이언트가 localStorage 로 폴백하도록 persisted=false.
    return NextResponse.json({
      keywords: null,
      persisted: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function PUT(request: Request) {
  let body: { keywords?: Keyword[] };
  try {
    body = (await request.json()) as { keywords?: Keyword[] };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  if (!Array.isArray(body.keywords)) {
    return NextResponse.json({ error: "keywords 배열이 필요합니다." }, { status: 400 });
  }
  try {
    await writeWatchlist(body.keywords);
    return NextResponse.json({ ok: true, saved: body.keywords.length, persisted: isSupabaseConfigured() });
  } catch (e) {
    return NextResponse.json(
      { error: "저장 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
