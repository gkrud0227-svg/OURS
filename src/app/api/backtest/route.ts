import { NextResponse } from "next/server";
import type { WeekPoint } from "@/lib/types";
import { backtestKeyword, summarize, type BacktestResult } from "@/lib/backtest";

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";

interface DataLabItem {
  title: string;
  keywords: string[];
  data: { period: string; ratio: number }[];
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(request: Request) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "네이버 데이터랩 API 키가 설정되지 않았습니다. (.env.local의 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)" },
      { status: 400 },
    );
  }

  let body: { keywords?: string[]; startDate?: string; endDate?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const keywords = (body.keywords ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
  if (!keywords.length) {
    return NextResponse.json({ error: "백테스트할 키워드가 없습니다." }, { status: 400 });
  }

  // 기본 구간: 과거 약 5년 주간.
  // 넓어야 하는 이유 — 급상승 감지는 부상 전 4주 베이스라인이 있어야 MA가 작동한다.
  // 윈도우가 키워드의 부상기에서 시작하면 그 warmup이 신호를 삼켜 실제보다 불리해진다.
  // (실서비스에선 언제나 과거 데이터가 존재하므로 이 문제가 없다.)
  const end = body.endDate ? new Date(body.endDate) : new Date();
  const start = body.startDate
    ? new Date(body.startDate)
    : new Date(end.getFullYear() - 5, end.getMonth(), end.getDate());
  const startDate = fmt(start);
  const endDate = fmt(end);

  // 데이터랩은 요청당 키워드 그룹 최대 5개.
  // ⚠️ 키워드마다 단독 조회한다 (묶음 금지).
  // 데이터랩은 한 요청에 든 키워드 그룹의 최댓값을 100으로 정규화한다. 5개씩 묶으면
  // 큰 키워드가 스케일을 지배해 작은 키워드의 초기 곡선이 SIGNAL_FLOOR(=5) 아래로
  // 눌리고, 그 결과 조기 신호가 통째로 사라진다. (실측: 양쯔깐루가 묶음에선 0주,
  // 단독에선 18주 선행) 배치 조성에 따라 결과가 달라지는 것을 막으려면 단독 조회뿐이다.
  const chunks: string[][] = keywords.map((k) => [k]);

  const seriesByKeyword = new Map<string, WeekPoint[]>();
  try {
    for (const chunk of chunks) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          timeUnit: "week",
          keywordGroups: chunk.map((k) => ({ groupName: k, keywords: [k] })),
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json(
          {
            error: `데이터랩 API 오류 (HTTP ${res.status}).`,
            detail: detail.slice(0, 400),
          },
          { status: 502 },
        );
      }
      const json = (await res.json()) as { results?: DataLabItem[] };
      for (const item of json.results ?? []) {
        seriesByKeyword.set(
          item.title,
          (item.data ?? []).map((d) => ({ period: d.period, ratio: d.ratio })),
        );
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: "데이터랩 서버에 연결하지 못했습니다.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // 요청 순서를 유지해 결과표를 안정적으로.
  const results: BacktestResult[] = keywords
    .map((kw) => {
      const weeks = seriesByKeyword.get(kw);
      return weeks && weeks.length ? backtestKeyword(kw, weeks) : null;
    })
    .filter((r): r is BacktestResult => r !== null);

  const missingData = keywords.filter((kw) => !(seriesByKeyword.get(kw)?.length));

  return NextResponse.json({
    startDate,
    endDate,
    results,
    summary: summarize(results),
    missingData,
  });
}
