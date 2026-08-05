import { NextResponse } from "next/server";
import { analyzeReasons } from "@/lib/reasons";
import { extractCoTerms } from "@/lib/cooccurrence";
import { loadInstagramCaptions } from "@/lib/instagram-captions";
import { filterDocsByLocale, localeForRegion } from "@/lib/lang";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const REGION_LANG: Record<string, string> = {
  US: "en",
  GB: "en",
  KR: "ko",
  JP: "ja",
  FR: "fr",
  DE: "de",
  CN: "zh-Hans",
};

interface SearchItem {
  id?: { videoId?: string };
  pageInfo?: { totalResults?: number };
}
interface VideoItem {
  id: string;
  snippet?: { title?: string; description?: string; channelTitle?: string };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

function parseDurationSec(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function POST(request: Request) {
  let body: { keyword?: string; region?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) {
    return NextResponse.json({ error: "키워드가 필요합니다." }, { status: 400 });
  }
  const region = (body.region ?? "US").toUpperCase();
  const windowDays = Math.min(Math.max(body.days ?? 90, 7), 365);

  // 1) YouTube 해외 신호 (검색 1회 = 100 units)
  const key = process.env.YOUTUBE_API_KEY;
  let ytDocs: string[] = [];
  let ytError: string | null = null;
  let videoCount = 0;
  let sampled = 0;
  let totalViews = 0;
  let shortCount = 0;
  let topVideo: { videoId: string; title: string; channel: string; views: number } | null =
    null;

  if (!key) {
    ytError = "YouTube API 키가 설정되지 않았습니다.";
  } else {
    try {
      const publishedAfter = new Date(Date.now() - windowDays * MS_PER_DAY).toISOString();
      const sp = new URLSearchParams({
        key,
        part: "snippet",
        type: "video",
        order: "viewCount",
        maxResults: "50",
        regionCode: region,
        relevanceLanguage: REGION_LANG[region] ?? "en",
        publishedAfter,
        q: keyword,
      });
      const sr = await fetch(`${SEARCH_URL}?${sp}`, { cache: "no-store" });
      if (!sr.ok) throw new Error(`search ${sr.status}: ${(await sr.text()).slice(0, 140)}`);
      const sj = (await sr.json()) as {
        items?: SearchItem[];
        pageInfo?: { totalResults?: number };
      };
      const ids = (sj.items ?? [])
        .map((i) => i.id?.videoId)
        .filter((v): v is string => Boolean(v));
      videoCount = sj.pageInfo?.totalResults ?? ids.length;

      if (ids.length) {
        const vp = new URLSearchParams({
          key,
          part: "snippet,statistics,contentDetails",
          id: ids.join(","),
          maxResults: "50",
        });
        const vr = await fetch(`${VIDEOS_URL}?${vp}`, { cache: "no-store" });
        if (!vr.ok) throw new Error(`videos ${vr.status}`);
        const vj = (await vr.json()) as { items?: VideoItem[] };
        const items = vj.items ?? [];
        sampled = items.length;
        for (const v of items) {
          const views = Number(v.statistics?.viewCount ?? 0);
          totalViews += views;
          if (parseDurationSec(v.contentDetails?.duration ?? "") <= 60) shortCount += 1;
          ytDocs.push(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`);
          if (!topVideo || views > topVideo.views) {
            topVideo = {
              videoId: v.id,
              title: v.snippet?.title ?? "",
              channel: v.snippet?.channelTitle ?? "",
              views,
            };
          }
        }
      }
    } catch (e) {
      ytError = e instanceof Error ? e.message : String(e);
      ytDocs = [];
    }
  }

  // 2) 로컬 Instagram 캡션 (영문 키워드로 수집했다면 잡힘)
  const igDocs = loadInstagramCaptions(keyword);

  // 3) 다국어 영상 제거 — 해외 검색에도 스페인어·인니어 등이 섞여 들어온다.
  const locale = localeForRegion(region);
  const ytFiltered = filterDocsByLocale(ytDocs, locale);
  const droppedByLang = ytDocs.length - ytFiltered.length;

  const docs = [...ytFiltered, ...igDocs];
  if (!docs.length) {
    return NextResponse.json(
      {
        error:
          "분석할 텍스트가 없습니다. YouTube 호출이 실패했고, 이 키워드로 수집한 Instagram 캡션도 없습니다.",
        detail: ytError ?? undefined,
      },
      { status: 502 },
    );
  }

  const reasons = analyzeReasons(docs, locale);
  reasons.ytDocCount = ytFiltered.length;
  reasons.igDocCount = igDocs.length;

  const coTerms = extractCoTerms(docs, keyword, 15, 2);

  return NextResponse.json({
    keyword,
    region,
    windowDays,
    youtube: {
      videoCount,
      sampled,
      avgViews: sampled ? Math.round(totalViews / sampled) : 0,
      shortCount,
      topVideo,
    },
    counts: {
      yt: ytFiltered.length,
      ig: igDocs.length,
      total: docs.length,
      droppedByLang,
    },
    ytError: ytError ?? undefined,
    reasons,
    coTerms,
  });
}
