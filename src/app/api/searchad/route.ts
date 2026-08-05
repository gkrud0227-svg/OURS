import { NextResponse } from "next/server";
import { fetchKeywordstool, KeywordstoolError } from "@/lib/keywordstool";

export async function POST(request: Request) {
  let body: { seeds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const seeds = body.seeds ?? [];
  try {
    const candidates = (await fetchKeywordstool(seeds)).slice(0, 150);
    return NextResponse.json({ seeds, candidates });
  } catch (e) {
    if (e instanceof KeywordstoolError) {
      return NextResponse.json(
        { error: e.message, detail: e.detail },
        { status: e.status },
      );
    }
    return NextResponse.json(
      { error: "검색광고 요청에 실패했습니다.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
