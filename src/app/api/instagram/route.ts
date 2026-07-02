import { NextResponse } from "next/server";
import type { InstagramMediaLite, InstagramStat } from "@/lib/types";

const GRAPH = "https://graph.facebook.com";

interface HashtagSearchResp {
  data?: { id: string }[];
  error?: { message?: string };
}
interface MediaResp {
  data?: {
    id: string;
    media_type?: string;
    media_product_type?: string;
    like_count?: number;
    comments_count?: number;
    caption?: string;
    permalink?: string;
  }[];
  error?: { message?: string };
}

/** 해시태그로 사용할 수 있도록 정규화(#, 공백 제거). */
function toHashtag(keyword: string): string {
  return keyword.replace(/^#/, "").replace(/\s+/g, "");
}

async function statFor(
  keyword: string,
  version: string,
  userId: string,
  token: string,
): Promise<InstagramStat | null> {
  const hashtag = toHashtag(keyword);
  if (!hashtag) return null;

  // 1) 해시태그 ID 조회
  const searchUrl = `${GRAPH}/${version}/ig_hashtag_search?${new URLSearchParams({
    user_id: userId,
    q: hashtag,
    access_token: token,
  })}`;
  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  const searchJson = (await searchRes.json()) as HashtagSearchResp;
  if (!searchRes.ok || searchJson.error) {
    throw new Error(searchJson.error?.message ?? `hashtag_search ${searchRes.status}`);
  }
  const hashtagId = searchJson.data?.[0]?.id;
  if (!hashtagId) return null;

  // 2) 인기 미디어(top_media) 조회
  const fields = "id,media_type,media_product_type,like_count,comments_count,caption,permalink";
  const mediaUrl = `${GRAPH}/${version}/${hashtagId}/top_media?${new URLSearchParams({
    user_id: userId,
    fields,
    limit: "25",
    access_token: token,
  })}`;
  const mediaRes = await fetch(mediaUrl, { cache: "no-store" });
  const mediaJson = (await mediaRes.json()) as MediaResp;
  if (!mediaRes.ok || mediaJson.error) {
    throw new Error(mediaJson.error?.message ?? `top_media ${mediaRes.status}`);
  }

  const media = mediaJson.data ?? [];
  let totalLikes = 0;
  let totalComments = 0;
  let reelsCount = 0;
  let top: InstagramMediaLite | null = null;

  for (const m of media) {
    const likes = m.like_count ?? 0;
    const comments = m.comments_count ?? 0;
    const isReel =
      m.media_product_type === "REELS" || m.media_type === "VIDEO";
    totalLikes += likes;
    totalComments += comments;
    if (isReel) reelsCount += 1;
    const lite: InstagramMediaLite = {
      id: m.id,
      permalink: m.permalink ?? "",
      isReel,
      likes,
      comments,
      caption: (m.caption ?? "").slice(0, 140),
    };
    if (!top || lite.likes > top.likes) top = lite;
  }

  const sampled = media.length;
  return {
    hashtag,
    sampled,
    reelsCount,
    totalLikes,
    totalComments,
    avgLikes: sampled ? Math.round(totalLikes / sampled) : 0,
    topMedia: top,
    fetchedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  const version = process.env.IG_GRAPH_VERSION || "v21.0";

  if (!token || !userId) {
    return NextResponse.json(
      {
        error:
          "Instagram Graph API가 설정되지 않았습니다. .env.local에 IG_ACCESS_TOKEN, IG_USER_ID(비즈니스 IG 계정 ID)를 추가하세요. (설정 방법은 README 참고)",
      },
      { status: 400 },
    );
  }

  let body: { keywords?: string[] };
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

  const stats: Record<string, InstagramStat> = {};
  let firstError: string | null = null;

  // 해시태그 검색은 7일당 30개 제한이 있어 순차 처리한다.
  for (const kw of keywords) {
    try {
      const stat = await statFor(kw, version, userId, token);
      if (stat) stats[kw] = stat;
    } catch (e) {
      firstError = firstError ?? (e instanceof Error ? e.message : String(e));
    }
  }

  if (Object.keys(stats).length === 0) {
    return NextResponse.json(
      {
        error:
          "Instagram 데이터를 가져오지 못했습니다. 토큰 권한(instagram_basic 등), 비즈니스 계정 연결, 7일당 30개 해시태그 제한을 확인하세요.",
        detail: firstError ?? undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ stats, partialError: firstError ?? undefined });
}
