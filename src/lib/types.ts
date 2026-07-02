export type Category = "베이커리" | "음료" | "디저트" | "스낵";

export const CATEGORIES: Category[] = ["베이커리", "음료", "디저트", "스낵"];

export type TrendSource = "sample" | "datalab";

export interface WeekPoint {
  /** Week start date, formatted YYYY-MM-DD */
  period: string;
  /** Relative search index (0–100), as returned by Naver DataLab */
  ratio: number;
}

export interface Keyword {
  id: string;
  name: string;
  category: Category;
  /** Recent weekly search index points (most recent last). */
  weeks: WeekPoint[];
  /** Manually entered TikTok mention count. */
  tiktok: number | null;
  /** Where the current trend data came from. */
  source?: TrendSource;
  /** ISO timestamp of the last trend update. */
  updatedAt: string | null;
  /** YouTube 신호 (공식 Data API v3). */
  youtube?: YouTubeStat | null;
  /** Instagram 해시태그 신호 (Graph API). */
  instagram?: InstagramStat | null;
  /** 월간 검색량(PC+모바일) — 네이버 검색광고 keywordstool. */
  volumeTotal?: number | null;
}

/* ---------- 키워드 발굴 (검색광고 keywordstool) ---------- */

export interface Candidate {
  name: string;
  /** 월간 PC 검색량 */
  volumePc: number;
  /** 월간 모바일 검색량 */
  volumeMobile: number;
  /** 월간 합계 검색량 */
  volumeTotal: number;
  /** 경쟁정도 (낮음/중간/높음) */
  compIdx?: string;
  /** 데이터랩 최근 4주 (없을 수 있음) */
  weeks: WeekPoint[];
  /** 전주 대비 상승률(%) */
  riseRate: number | null;
  /** 발굴 점수 0~100 */
  score: number;
}

/* ---------- YouTube ---------- */

export interface YouTubeVideoLite {
  videoId: string;
  title: string;
  channel: string;
  views: number;
  publishedAt: string;
  /** 길이 60초 이하 → Shorts 근사. */
  isShort: boolean;
}

export interface YouTubeStat {
  /** 전체 매칭 영상 수(추정) = search.list pageInfo.totalResults. */
  videoCount: number;
  /** 숏츠(짧은 영상, <4분) 수(추정) = videoDuration=short 검색의 총수. */
  shortCount: number;
  /** 롱폼 영상 수(추정) = 전체 − 숏츠. */
  longCount: number;
  /** 조회수 통계를 계산한 샘플 영상 수. */
  sampled: number;
  totalViews: number;
  avgViews: number;
  topVideo: YouTubeVideoLite | null;
  /** 조회 대상 기간(일). */
  windowDays: number;
  fetchedAt: string;
}

/* ---------- Instagram (해시태그) ---------- */

export interface InstagramMediaLite {
  id: string;
  permalink: string;
  /** media_product_type === "REELS". */
  isReel: boolean;
  likes: number;
  comments: number;
  caption: string;
}

export interface InstagramStat {
  hashtag: string;
  /** 분석한(샘플) 미디어 수. */
  sampled: number;
  reelsCount: number;
  totalLikes: number;
  totalComments: number;
  avgLikes: number;
  topMedia: InstagramMediaLite | null;
  fetchedAt: string;
}

export type ScoreKey =
  | "trendSignal"
  | "scarcity"
  | "vendingFit"
  | "sourcing"
  | "priceFit";

export interface Scorecard {
  id: string;
  productName: string;
  keywordId: string | null;
  /** Each criterion is scored 0–20 (5 × 20 = 100 total). */
  scores: Record<ScoreKey, number>;
  createdAt: string;
}
