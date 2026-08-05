import { NextResponse } from "next/server";
import { loadInstagramCaptions } from "@/lib/instagram-captions";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 동시언급은 표본이 많을수록 정확하므로 창을 넓게 잡는다. */
const WINDOW_DAYS = 90;

/**
 * 검색 의도 접미어. "떡갈비만들기"는 그대로는 캡션에 안 나오므로
 * 핵심어("떡갈비")로 매칭한다.
 */
const INTENT_SUFFIXES = [
  "만들기", "레시피", "추천", "종류", "가격", "유통기한", "칼로리", "맛집", "파는곳",
];

function coreTerm(name: string): string {
  const t = name.replace(/\s+/g, "");
  for (const s of INTENT_SUFFIXES) {
    if (t.length > s.length + 1 && t.endsWith(s)) return t.slice(0, -s.length);
  }
  return t;
}

interface SearchItem {
  id?: { videoId?: string };
}
interface VideoItem {
  snippet?: { title?: string; description?: string };
}

/** 키워드의 대표 YouTube 영상 50건의 제목+설명 텍스트. */
async function fetchYouTubeDocs(keyword: string, key: string): Promise<string[]> {
  const publishedAfter = new Date(Date.now() - WINDOW_DAYS * MS_PER_DAY).toISOString();
  const searchParams = new URLSearchParams({
    key,
    part: "snippet",
    type: "video",
    order: "viewCount",
    maxResults: "50",
    regionCode: "KR",
    relevanceLanguage: "ko",
    publishedAfter,
    q: keyword,
  });
  const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`, { cache: "no-store" });
  if (!searchRes.ok) {
    const detail = await searchRes.text();
    throw new Error(`search ${searchRes.status}: ${detail.slice(0, 160)}`);
  }
  const searchJson = (await searchRes.json()) as { items?: SearchItem[] };
  const ids = (searchJson.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((v): v is string => Boolean(v));
  if (!ids.length) return [];

  const videoParams = new URLSearchParams({
    key,
    part: "snippet",
    id: ids.join(","),
    maxResults: "50",
  });
  const videoRes = await fetch(`${VIDEOS_URL}?${videoParams}`, { cache: "no-store" });
  if (!videoRes.ok) {
    const detail = await videoRes.text();
    throw new Error(`videos ${videoRes.status}: ${detail.slice(0, 160)}`);
  }
  const videoJson = (await videoRes.json()) as { items?: VideoItem[] };
  return (videoJson.items ?? []).map((v) =>
    `${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`.toLowerCase(),
  );
}

export async function POST(request: Request) {
  let body: { keyword?: string; terms?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  const terms = (body.terms ?? [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);
  if (!keyword || !terms.length) {
    return NextResponse.json(
      { error: "키워드와 검증할 후보가 필요합니다." },
      { status: 400 },
    );
  }

  // 코퍼스 1: 로컬 수집한 Instagram 캡션 (소비자 언어 — 가장 정확)
  const igDocs = loadInstagramCaptions(keyword).map((d) => d.toLowerCase());

  // 코퍼스 2: YouTube 제목·설명 (쿼터 초과 시 실패해도 IG만으로 진행)
  const key = process.env.YOUTUBE_API_KEY;
  let ytDocs: string[] = [];
  let ytError: string | null = null;
  if (!key) {
    ytError = "YouTube API 키가 설정되지 않았습니다.";
  } else {
    try {
      ytDocs = await fetchYouTubeDocs(keyword, key);
    } catch (e) {
      ytError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!ytDocs.length && !igDocs.length) {
    return NextResponse.json(
      {
        error:
          "검증할 텍스트가 없습니다. YouTube 호출이 실패했고, 이 키워드로 수집한 Instagram 캡션도 없습니다. (/instagram 에서 먼저 수집해 보세요)",
        detail: ytError ?? undefined,
      },
      { status: 502 },
    );
  }

  const total = ytDocs.length + igDocs.length;
  const results = terms.map((term) => {
    const core = coreTerm(term).toLowerCase();
    const ytHits = core ? ytDocs.filter((d) => d.includes(core)).length : 0;
    const igHits = core ? igDocs.filter((d) => d.includes(core)).length : 0;
    const docs = ytHits + igHits;
    return { term, core, docs, ytHits, igHits, rate: total ? docs / total : 0 };
  });

  return NextResponse.json({
    keyword,
    docCount: total,
    ytCount: ytDocs.length,
    igCount: igDocs.length,
    ytError: ytError ?? undefined,
    results,
  });
}
