import { NextResponse } from "next/server";
import {
  contentBacktest,
  summarizeContent,
  type ContentBacktestResult,
} from "@/lib/content-backtest";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 키워드당 검색 페이지 수 (1페이지 50편 = 100 units). */
const PAGES = 2;
/**
 * 콘텐츠 수집 창 — 피크 이전 몇 개월까지.
 *
 * ⚠️ 상한(publishedBefore)만 두고 order=viewCount로 받으면, **누적 조회수가 쌓인
 *    옛날 영상**이 상위로 올라온다. 탕후루처럼 트렌드 이전부터 존재한 키워드는
 *    2018~2020년 일반 영상이 잡혀 "콘텐츠 40개월 선행" 같은 거짓 결론이 난다.
 *    피크 이전 12개월로 창을 좁혀 **트렌드 시기 영상만** 본다.
 */
const WINDOW_MONTHS_BEFORE_PEAK = 12;

interface ReqItem {
  keyword: string;
  signalPeriod?: string | null;
  peakPeriod?: string | null;
}
interface SearchItem {
  snippet?: { publishedAt?: string };
}

export async function POST(request: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "YouTube API 키가 설정되지 않았습니다. (.env.local의 YOUTUBE_API_KEY)" },
      { status: 400 },
    );
  }

  let body: { items?: ReqItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const items = (body.items ?? [])
    .filter((it) => it && typeof it.keyword === "string" && it.keyword.trim())
    .slice(0, 8);
  if (!items.length) {
    return NextResponse.json({ error: "분석할 키워드가 없습니다." }, { status: 400 });
  }

  const results: ContentBacktestResult[] = [];
  const errors: string[] = [];

  for (const it of items) {
    const keyword = it.keyword.trim();
    // 트렌드 시기로 창을 한정: [피크 − 12개월, 피크 + 1개월].
    // 하한(publishedAfter)이 옛날 누적조회 영상을 잘라내고, 상한이 피크 이후
    // 폭발분을 제외해 "개시 시점"을 선명하게 한다.
    let after: string | undefined;
    let before: string | undefined;
    if (it.peakPeriod) {
      const peak = new Date(it.peakPeriod);
      const lo = new Date(peak);
      lo.setMonth(lo.getMonth() - WINDOW_MONTHS_BEFORE_PEAK);
      after = lo.toISOString();
      before = new Date(peak.getTime() + 30 * MS_PER_DAY).toISOString();
    }

    const dates: string[] = [];
    try {
      let token: string | undefined;
      for (let p = 0; p < PAGES; p += 1) {
        const sp = new URLSearchParams({
          key,
          part: "snippet",
          type: "video",
          order: "viewCount",
          maxResults: "50",
          regionCode: "KR",
          relevanceLanguage: "ko",
          q: keyword,
        });
        if (after) sp.set("publishedAfter", after);
        if (before) sp.set("publishedBefore", before);
        if (token) sp.set("pageToken", token);

        const res = await fetch(`${SEARCH_URL}?${sp}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 120)}`);
        }
        const json = (await res.json()) as { items?: SearchItem[]; nextPageToken?: string };
        for (const v of json.items ?? []) {
          if (v.snippet?.publishedAt) dates.push(v.snippet.publishedAt);
        }
        if (!json.nextPageToken) break;
        token = json.nextPageToken;
      }
    } catch (e) {
      errors.push(`${keyword}: ${e instanceof Error ? e.message : String(e)}`);
    }

    results.push(
      contentBacktest(keyword, dates, it.signalPeriod ?? null, it.peakPeriod ?? null),
    );
  }

  const joined = errors.join(" / ");
  const quotaHit = /429|quota/i.test(joined);
  if (quotaHit && results.every((r) => r.sampled === 0)) {
    return NextResponse.json(
      {
        error: "YouTube 일일 쿼터를 모두 썼습니다. 태평양시 자정 초기화 후 다시 시도하세요.",
        detail: joined,
      },
      { status: 429 },
    );
  }

  return NextResponse.json({
    results,
    summary: summarizeContent(results),
    ytError: joined || undefined,
  });
}
