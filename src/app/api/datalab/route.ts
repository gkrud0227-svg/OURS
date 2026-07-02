import { NextResponse } from "next/server";

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
      {
        error:
          "네이버 데이터랩 API 키가 설정되지 않았습니다. .env.local에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET를 추가한 뒤 서버를 다시 시작하세요. (자세한 발급 방법은 README 참고)",
      },
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
    .filter(Boolean);

  if (!keywords.length) {
    return NextResponse.json({ error: "조회할 키워드가 없습니다." }, { status: 400 });
  }

  const end = body.endDate ? new Date(body.endDate) : new Date();
  // 미완결(진행 중) 주를 버린 뒤에도 완결된 주 4개가 남도록 약 7주(48일) 전부터 조회.
  const start = body.startDate
    ? new Date(body.startDate)
    : new Date(end.getTime() - 48 * MS_PER_DAY);
  const startDate = fmt(start);
  const endDate = fmt(end);

  // 오늘이 포함된 주는 아직 진행 중(부분 집계)이라 전주 대비 비교를 왜곡한다.
  // 주 시작일 + 7일이 오늘 자정 이하일 때만 "완결된 주"로 간주해 남긴다.
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const isCompleteWeek = (period: string) =>
    new Date(period).getTime() + 7 * MS_PER_DAY <= todayStart;

  // 데이터랩은 요청당 키워드 그룹을 최대 5개까지 허용한다.
  const chunks: string[][] = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }

  const results: DataLabItem[] = [];
  try {
    for (const chunk of chunks) {
      const payload = {
        startDate,
        endDate,
        timeUnit: "week",
        keywordGroups: chunk.map((k) => ({ groupName: k, keywords: [k] })),
      };
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json(
          {
            error: `데이터랩 API 오류 (HTTP ${res.status}). API 키와 애플리케이션의 '검색어트렌드' 사용 설정을 확인하세요.`,
            detail: detail.slice(0, 500),
          },
          { status: 502 },
        );
      }

      const json = (await res.json()) as { results?: DataLabItem[] };
      for (const item of json.results ?? []) {
        results.push({
          title: item.title,
          keywords: item.keywords,
          data: (item.data ?? [])
            .filter((d) => isCompleteWeek(d.period))
            .map((d) => ({
            period: d.period,
            ratio: d.ratio,
          })),
        });
      }
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "데이터랩 서버에 연결하지 못했습니다.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ startDate, endDate, results });
}
