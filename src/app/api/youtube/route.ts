import { NextResponse } from "next/server";
import type { YouTubeStat, YouTubeVideoLite } from "@/lib/types";
import { analyzeReasons } from "@/lib/reasons";
import { loadInstagramCaptions } from "@/lib/instagram-captions";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO 8601 duration (PT#H#M#S) → 초. */
function parseDurationSec(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

interface SearchItem {
  id?: { videoId?: string };
}
interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    description?: string;
  };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

/** 지역코드 → 검색 언어 매핑 (해외 신호 조회용) */
const REGION_LANG: Record<string, string> = {
  KR: "ko",
  US: "en",
  GB: "en",
  JP: "ja",
  TW: "zh-Hant",
  FR: "fr",
  DE: "de",
};

async function searchTotals(
  keyword: string,
  key: string,
  publishedAfter: string,
  region = "KR",
): Promise<{ ids: string[]; total: number }> {
  const params = new URLSearchParams({
    key,
    part: "snippet",
    type: "video",
    order: "viewCount",
    // search.list는 25건이든 50건이든 똑같이 100 units를 쓴다 → 표본은 최대치(50)로.
    // (videos.list는 한 번에 id 50개까지 받으므로 추가 호출 없이 처리됨)
    maxResults: "50",
    regionCode: region,
    relevanceLanguage: REGION_LANG[region] ?? "en",
    publishedAfter,
    q: keyword,
  });

  const res = await fetch(`${SEARCH_URL}?${params}`, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`search ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    items?: SearchItem[];
    pageInfo?: { totalResults?: number };
  };
  const ids = (json.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((v): v is string => Boolean(v));
  return { ids, total: json.pageInfo?.totalResults ?? ids.length };
}

async function statFor(
  keyword: string,
  key: string,
  windowDays: number,
  region = "KR",
): Promise<YouTubeStat | null> {
  const publishedAfter = new Date(Date.now() - windowDays * MS_PER_DAY).toISOString();

  // 검색 1회로 전체 매칭 수(추정)와 샘플 영상 ids를 얻는다. (쿼터 절약)
  const all = await searchTotals(keyword, key, publishedAfter, region);
  const ids = all.ids;
  const videoCount = all.total;

  if (!ids.length) {
    return {
      videoCount,
      shortCount: 0,
      longCount: videoCount,
      sampled: 0,
      totalViews: 0,
      avgViews: 0,
      topVideo: null,
      windowDays,
      fetchedAt: new Date().toISOString(),
    };
  }

  const videoParams = new URLSearchParams({
    key,
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    maxResults: "50",
  });
  const videoRes = await fetch(`${VIDEOS_URL}?${videoParams}`, { cache: "no-store" });
  if (!videoRes.ok) {
    const detail = await videoRes.text();
    throw new Error(`videos ${videoRes.status}: ${detail.slice(0, 200)}`);
  }
  const videoJson = (await videoRes.json()) as { items?: VideoItem[] };
  const items = videoJson.items ?? [];

  let totalViews = 0;
  let sampledShorts = 0;
  let top: YouTubeVideoLite | null = null;
  const texts: string[] = [];

  for (const v of items) {
    const views = Number(v.statistics?.viewCount ?? 0);
    const isShort = parseDurationSec(v.contentDetails?.duration ?? "") <= 60;
    totalViews += views;
    if (isShort) sampledShorts += 1;
    texts.push(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`);
    const lite: YouTubeVideoLite = {
      videoId: v.id,
      title: v.snippet?.title ?? "",
      channel: v.snippet?.channelTitle ?? "",
      views,
      publishedAt: v.snippet?.publishedAt ?? "",
      isShort,
    };
    if (!top || lite.views > top.views) top = lite;
  }

  const sampled = items.length;
  // 샘플의 Shorts(≤60초) 비율로 전체 숏츠/롱폼 수를 추정 (검색 추가 호출 없이).
  const shortCount = sampled
    ? Math.round(videoCount * (sampledShorts / sampled))
    : 0;
  const longCount = Math.max(0, videoCount - shortCount);

  // 로컬 수집한 Instagram 캡션(소비자 언어)을 이유 태그 코퍼스에 합산. (국내 전용)
  const igDocs = region === "KR" ? loadInstagramCaptions(keyword) : [];
  const reasons = analyzeReasons([...texts, ...igDocs], region === "KR" ? "ko" : "en");
  reasons.ytDocCount = texts.length;
  reasons.igDocCount = igDocs.length;

  return {
    videoCount,
    shortCount,
    longCount,
    sampled,
    totalViews,
    avgViews: sampled ? Math.round(totalViews / sampled) : 0,
    topVideo: top,
    reasons,
    windowDays,
    fetchedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "YouTube API 키가 설정되지 않았습니다. .env.local에 YOUTUBE_API_KEY를 추가하세요. (발급 방법은 README 참고)",
      },
      { status: 400 },
    );
  }

  let body: { keywords?: string[]; days?: number; region?: string };
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
  const windowDays = Math.min(Math.max(body.days ?? 28, 1), 90);
  const region = (body.region ?? "KR").toUpperCase();

  const stats: Record<string, YouTubeStat> = {};
  let firstError: string | null = null;

  const settled = await Promise.allSettled(
    keywords.map(async (kw) => {
      const stat = await statFor(kw, key, windowDays, region);
      if (stat) stats[kw] = stat;
    }),
  );
  for (const r of settled) {
    if (r.status === "rejected") {
      firstError = firstError ?? String(r.reason?.message ?? r.reason);
    }
  }

  // 전부 실패했다면(키 오류/쿼터 초과 등) 오류로 응답.
  if (Object.keys(stats).length === 0) {
    return NextResponse.json(
      {
        error:
          "YouTube 데이터를 가져오지 못했습니다. API 키, YouTube Data API v3 활성화, 일일 쿼터를 확인하세요.",
        detail: firstError ?? undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ stats, windowDays, partialError: firstError ?? undefined });
}
