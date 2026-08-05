export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  numComments: number;
  permalink: string;
  createdUtc: number;
}

export interface RedditStat {
  keyword: string;
  /** 검색된 게시물 수 (샘플) */
  postCount: number;
  /** 최근 30일 게시물 수 */
  recentCount: number;
  /** 그 이전 30일(30~60일) 게시물 수 — 증감 비교용 */
  priorCount: number;
  /** (recent - prior) / prior * 100 */
  riseRate: number | null;
  totalScore: number;
  avgScore: number;
  totalComments: number;
  topPost: RedditPost | null;
  subreddits: string[];
  fetchedAt: string;
}

export interface RedditResult {
  stat: RedditStat;
  /** 이유 태그·동반 키워드 분석용 텍스트 (제목 + 본문) */
  docs: string[];
}

export async function fetchReddit(
  keyword: string,
  subreddits?: string[],
): Promise<RedditResult> {
  const res = await fetch("/api/reddit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, subreddits }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? "Reddit 요청에 실패했습니다.");
  }
  return json as RedditResult;
}
