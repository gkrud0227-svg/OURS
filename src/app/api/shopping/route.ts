import { NextResponse } from "next/server";

/**
 * 네이버 데이터랩 쇼핑인사이트 — 식품 분야 키워드별 **쇼핑 클릭 추이**.
 *
 * 검색어 트렌드와 다른 신호다.
 *   검색어 트렌드 = 검색했다        → 관심·호기심
 *   쇼핑인사이트  = 상품을 클릭했다  → 구매 의향
 *
 * "검색은 늘었는데 쇼핑 클릭은 안 늘었다"면 화제성만 있고 구매로 이어지지 않는
 * 트렌드다. 그래서 검색 검증 위에 얹는 세 번째 축으로 쓴다.
 *
 * ⚠️ 이 API 로는 발굴이 불가능하다. 실측 결과 인기검색어 목록을 주는 엔드포인트가
 *    없고(`keyword/rank` 는 keyword 를 필수로 요구), 전부 "내가 넣은 키워드"의
 *    추이만 돌려준다. 후보 공급은 콘텐츠(YouTube)가 유일한 통로다.
 */

const ENDPOINT = "https://openapi.naver.com/v1/datalab/shopping/category/keywords";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** 네이버 쇼핑 대분류 '식품'. 하위 분류로 좁히려면 이 값을 바꾼다. */
const FOOD_CATEGORY = "50000006";

export interface ShoppingPoint {
  period: string;
  ratio: number;
}
export interface ShoppingItem {
  title: string;
  data: ShoppingPoint[];
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(request: Request) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "네이버 API 키가 없습니다. (.env.local 의 NAVER_CLIENT_ID / SECRET)" },
      { status: 400 },
    );
  }

  let body: { keywords?: string[]; startDate?: string; endDate?: string; category?: string };
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
  const start = body.startDate
    ? new Date(body.startDate)
    : new Date(end.getTime() - 48 * MS_PER_DAY);
  const category = (body.category ?? FOOD_CATEGORY).trim();

  // 검색어 트렌드와 동일하게 요청당 키워드 5개까지.
  const chunks: string[][] = [];
  for (let i = 0; i < keywords.length; i += 5) chunks.push(keywords.slice(i, i + 5));

  const results: ShoppingItem[] = [];
  const missing: string[] = [];

  for (const chunk of chunks) {
    const payload = {
      startDate: fmt(start),
      endDate: fmt(end),
      timeUnit: "week",
      category,
      keyword: chunk.map((k) => ({ name: k, param: [k] })),
    };
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch {
      // 한 청크가 죽어도 나머지는 살린다 — 쇼핑 축은 보조 신호라 없어도 화면이 돌아야 한다.
      missing.push(...chunk);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      // 권한 없음은 전체가 안 되는 것이라 명확히 알린다.
      if (res.status === 401) {
        return NextResponse.json(
          {
            error:
              "쇼핑인사이트 권한이 없습니다. 네이버 개발자센터 애플리케이션에 '데이터랩(쇼핑인사이트)'을 추가하세요.",
            detail: text.slice(0, 160),
          },
          { status: 401 },
        );
      }
      missing.push(...chunk);
      continue;
    }

    const json = (await res.json()) as { results?: { title?: string; data?: ShoppingPoint[] }[] };
    for (const r of json.results ?? []) {
      results.push({ title: r.title ?? "", data: r.data ?? [] });
    }
  }

  return NextResponse.json({ category, results, missing });
}
