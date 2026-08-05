import { NextResponse } from "next/server";
import { fetchKeywordstool, KeywordstoolError } from "@/lib/keywordstool";
import { computeCoverage } from "@/lib/coverage";

export async function POST(request: Request) {
  let body: { seeds?: string[]; hits?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const seeds = (body.seeds ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const hits = (body.hits ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);

  if (!seeds.length) {
    return NextResponse.json({ error: "시드 키워드가 없습니다." }, { status: 400 });
  }
  if (!hits.length) {
    return NextResponse.json({ error: "확인할 히트 키워드가 없습니다." }, { status: 400 });
  }

  try {
    const candidates = await fetchKeywordstool(seeds);
    const { hits: results, summary } = computeCoverage(candidates, hits);
    return NextResponse.json({
      seeds,
      poolSize: candidates.length,
      results,
      summary,
    });
  } catch (e) {
    if (e instanceof KeywordstoolError) {
      return NextResponse.json({ error: e.message, detail: e.detail }, { status: e.status });
    }
    return NextResponse.json(
      { error: "커버리지 조회에 실패했습니다.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
