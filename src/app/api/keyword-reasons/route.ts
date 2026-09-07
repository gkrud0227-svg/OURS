import { NextResponse } from "next/server";
import { analyzeReasons, type ReasonLocale } from "@/lib/reasons";
import { localeForRegion, localePredicate } from "@/lib/lang";

/**
 * 키워드별 확산 이유 — 검색 급상승으로 검증된 **상위 제품 후보**를 받아, 각 제품을
 * `order=viewCount`로 따로 검색해 **댓글 많은 인기 영상**을 찾고, 그 댓글에서 이유
 * (맛·식감·계절·비주얼·희소성)를 집계한다.
 *
 * 발굴 라우트의 최근 코퍼스(order=date)는 갓 올라온 영상이라 키워드당 댓글이 얇았다.
 * 여기서는 제품마다 인기 영상을 따로 긁어 표본을 두껍게 한다(제품당 search 1회=100 units).
 * 그래서 발굴과 분리해, 클라이언트가 랭킹된 상위 제품만 골라 호출하도록 둔다.
 */
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SEARCH_UNITS = 100;
const COMMENTS_UNITS = 1;

/** 이유를 붙일 제품 키워드 최대 수 (제품당 search 100 units라 상한이 곧 비용). */
const MAX_KEYWORDS = 8;
/** 제품당 댓글을 볼 인기 영상 수(order=viewCount 상위). */
const VIDEOS_PER_KEYWORD = 4;
/** 영상당 받을 상위 댓글 수(commentThreads.list 상한). */
const COMMENTS_PER_VIDEO = 100;
/** 인기 영상 검색 창(일) — 트렌드 맥락에 맞게 최근으로 제한하되 댓글이 쌓일 만큼 넓게. */
const SEARCH_DAYS = 180;

const REGION_LANG: Record<string, string> = { KR: "ko", US: "en", GB: "en", JP: "ja", CN: "zh-Hans" };

interface SearchItem {
  id?: { videoId?: string };
}
interface CommentThreadItem {
  snippet?: { topLevelComment?: { snippet?: { textOriginal?: string } } };
}

/** 한 제품을 order=viewCount로 검색해 인기 영상 ID를 받는다. 100 units. */
async function searchPopularVideos(
  key: string,
  term: string,
  region: string,
  publishedAfter: string,
): Promise<string[]> {
  const sp = new URLSearchParams({
    key,
    part: "snippet",
    type: "video",
    order: "viewCount",
    maxResults: String(VIDEOS_PER_KEYWORD),
    regionCode: region,
    relevanceLanguage: REGION_LANG[region] ?? "en",
    publishedAfter,
    q: term,
  });
  const res = await fetch(`${SEARCH_URL}?${sp}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: SearchItem[] };
  return (json.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => Boolean(v));
}

/** 한 영상의 상위 댓글을 받는다. 1 unit. 댓글이 꺼진 영상(403)은 빈 배열. */
async function fetchComments(key: string, videoId: string): Promise<string[]> {
  const sp = new URLSearchParams({
    key,
    part: "snippet",
    videoId,
    order: "relevance",
    maxResults: String(COMMENTS_PER_VIDEO),
    textFormat: "plainText",
  });
  const res = await fetch(`${COMMENTS_URL}?${sp}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: CommentThreadItem[] };
  return (json.items ?? [])
    .map((it) => it.snippet?.topLevelComment?.snippet?.textOriginal ?? "")
    .filter(Boolean);
}

export async function POST(request: Request) {
  let body: { terms?: string[]; region?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const region = (body.region ?? "KR").toUpperCase();
  const terms = [...new Set((body.terms ?? []).map((t) => t.trim()).filter(Boolean))].slice(
    0,
    MAX_KEYWORDS,
  );
  if (!terms.length) {
    return NextResponse.json({ error: "키워드가 최소 1개 필요합니다." }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "YouTube API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  const locale = localeForRegion(region);
  const keep = localePredicate(locale);
  const publishedAfter = new Date(Date.now() - SEARCH_DAYS * MS_PER_DAY).toISOString();
  let units = 0;

  const keywordReasons = await Promise.all(
    terms.map(async (term) => {
      try {
        const ids = await searchPopularVideos(key, term, region, publishedAfter);
        units += SEARCH_UNITS;
        const batches = await Promise.all(ids.map((id) => fetchComments(key, id)));
        units += ids.length * COMMENTS_UNITS;
        const raw = batches.flat();
        // 타언어 댓글은 이유 사전과 안 맞아 노이즈만 되므로 지역 언어만 남긴다.
        const filtered = raw.filter(keep);
        const comments = filtered.length >= 5 ? filtered : raw;
        return {
          term,
          commentCount: comments.length,
          videoCount: ids.length,
          reasons: analyzeReasons(comments, locale as ReasonLocale),
        };
      } catch {
        return {
          term,
          commentCount: 0,
          videoCount: 0,
          reasons: analyzeReasons([], locale as ReasonLocale),
        };
      }
    }),
  );

  return NextResponse.json({ region, quotaUnits: units, keywordReasons });
}
