import { NextResponse } from "next/server";
import { readLog, appendLog, type LogCandidate } from "@/lib/discovery-log-store";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * 전향적(forward) 발굴 로그.
 *
 * 발굴할 때마다 **처음 등장한 후보**를 출처·시점·초기 신호와 함께 append-only 로 남긴다.
 * 나중에 "자동완성 출처로 처음 잡힌 후보가 몇 주 뒤 실제 검색 히트가 됐나"를
 * **look-ahead 편향 없이** 측정하기 위한 것 — 자동완성은 과거 스냅샷이 없어 사후
 * 백테스트가 불가능하므로, 지금부터 앞으로 쌓아서 검증한다.
 *
 * 저장은 `discovery-log-store` 가 담당한다: Supabase 키가 있으면 테이블(영속),
 * 없으면 로컬 파일. Vercel 등 서버리스는 파일시스템이 임시라 **영속하려면 Supabase 필요**.
 */

export async function GET() {
  try {
    const entries = await readLog();
    return NextResponse.json({
      entries,
      total: entries.length,
      persisted: isSupabaseConfigured(), // true=Supabase(영속) / false=로컬 파일(휘발)
    });
  } catch (e) {
    return NextResponse.json(
      { error: "로그 읽기 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { at?: string; candidates?: LogCandidate[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const at = typeof body.at === "string" ? body.at : new Date().toISOString();
  try {
    const { added, total } = await appendLog(body.candidates ?? [], at);
    return NextResponse.json({ added, total, persisted: isSupabaseConfigured() });
  } catch (e) {
    return NextResponse.json(
      { error: "로그 저장 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
