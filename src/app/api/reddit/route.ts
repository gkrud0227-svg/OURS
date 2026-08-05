import { NextResponse } from "next/server";
import type { RedditPost, RedditStat } from "@/lib/reddit";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 해외 식품·디저트 담론이 모이는 기본 서브레딧. */
const DEFAULT_SUBREDDITS = [
  "food",
  "Baking",
  "desserts",
  "FoodPorn",
  "Cooking",
  "AskCulinary",
];

interface RawChild {
  data?: {
    id?: string;
    subreddit?: string;
    title?: string;
    selftext?: string;
    score?: number;
    num_comments?: number;
    permalink?: string;
    created_utc?: number;
  };
}

/** 앱 전용(client_credentials) 토큰. 1시간 유효하므로 메모리에 캐시한다. */
let cached: { token: string; expiresAt: number } | null = null;

async function getToken(id: string, secret: string, ua: string): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": ua,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`token ${res.status}: ${detail.slice(0, 160)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Reddit 토큰을 받지 못했습니다.");
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

async function searchSub(
  sub: string,
  keyword: string,
  token: string,
  ua: string,
): Promise<RedditPost[]> {
  const params = new URLSearchParams({
    q: keyword,
    restrict_sr: "1",
    sort: "new",
    t: "year",
    limit: "100",
  });
  const res = await fetch(`${API_BASE}/r/${sub}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": ua },
    cache: "no-store",
  });
  if (!res.ok) return []; // 개별 서브레딧 실패는 무시
  const json = (await res.json()) as { data?: { children?: RawChild[] } };
  return (json.data?.children ?? [])
    .map((c) => c.data)
    .filter(Boolean)
    .map((d) => ({
      id: d!.id ?? "",
      subreddit: d!.subreddit ?? sub,
      title: d!.title ?? "",
      selftext: (d!.selftext ?? "").slice(0, 1500),
      score: d!.score ?? 0,
      numComments: d!.num_comments ?? 0,
      permalink: d!.permalink ? `https://www.reddit.com${d!.permalink}` : "",
      createdUtc: d!.created_utc ?? 0,
    }));
}

export async function POST(request: Request) {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const ua = process.env.REDDIT_USER_AGENT || "nata-trend/0.1 (local research)";

  if (!id || !secret) {
    return NextResponse.json(
      {
        error:
          "Reddit API가 설정되지 않았습니다. .env.local에 REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET를 추가하세요. (reddit.com/prefs/apps 에서 script 앱 생성)",
      },
      { status: 400 },
    );
  }

  let body: { keyword?: string; subreddits?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) {
    return NextResponse.json({ error: "키워드가 필요합니다." }, { status: 400 });
  }
  const subs = (body.subreddits?.length ? body.subreddits : DEFAULT_SUBREDDITS)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  try {
    const token = await getToken(id, secret, ua);
    const lists = await Promise.all(subs.map((s) => searchSub(s, keyword, token, ua)));

    // id 기준 중복 제거
    const seen = new Set<string>();
    const posts: RedditPost[] = [];
    for (const p of lists.flat()) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      posts.push(p);
    }

    const now = Date.now();
    const recent = posts.filter((p) => now - p.createdUtc * 1000 <= 30 * MS_PER_DAY);
    const prior = posts.filter((p) => {
      const age = now - p.createdUtc * 1000;
      return age > 30 * MS_PER_DAY && age <= 60 * MS_PER_DAY;
    });
    const riseRate =
      prior.length === 0
        ? recent.length > 0
          ? 100
          : null
        : ((recent.length - prior.length) / prior.length) * 100;

    const totalScore = posts.reduce((a, p) => a + p.score, 0);
    const totalComments = posts.reduce((a, p) => a + p.numComments, 0);
    const topPost = posts.reduce<RedditPost | null>(
      (best, p) => (!best || p.score > best.score ? p : best),
      null,
    );

    const stat: RedditStat = {
      keyword,
      postCount: posts.length,
      recentCount: recent.length,
      priorCount: prior.length,
      riseRate,
      totalScore,
      avgScore: posts.length ? Math.round(totalScore / posts.length) : 0,
      totalComments,
      topPost,
      subreddits: subs,
      fetchedAt: new Date().toISOString(),
    };

    const docs = posts.map((p) => `${p.title} ${p.selftext}`);

    return NextResponse.json({ stat, docs });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "Reddit 데이터를 가져오지 못했습니다. client_id/secret과 User-Agent를 확인하세요.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
