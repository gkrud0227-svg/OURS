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

/** 발굴 출처 — 유튜브 콘텐츠 / 네이버 검색 자동완성 / 둘 다 */
export type DiscoverySource = "youtube" | "search" | "both";

export interface Candidate {
  name: string;
  /** 이 후보를 떠올린 발굴 소스 */
  source?: DiscoverySource;
  /** 유튜브 콘텐츠 확산 배수(lift) — 국내 발굴 탭 공유용 */
  lift?: number;
  /** 최근 이 용어를 쓴 채널 수 */
  dfRecent?: number;
  /** 과거 기준선에 없던 신조어인가 */
  novel?: boolean;
  /** 쇼핑 구매의향(검색 상승 후보만) — 국내 발굴 탭 공유용 */
  shop?: import("./shopping").ShoppingTrend;
  /** 식품 맥락 판정 — 유튜브 발굴 후보에만 있음(비식품이면 랭킹에서 강등) */
  contextTag?: "food" | "neutral" | "nonfood";
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

export interface ReasonCategory {
  key: string;
  label: string;
  /** 카테고리 사전 단어의 총 등장 횟수 */
  matches: number;
  /** 해당 카테고리 단어가 하나라도 나온 문서(영상) 수 */
  docHits: number;
  /** 실제로 잡힌 상위 단어 */
  topWords: string[];
  /** 이 카테고리를 언급한 문서 비율 (docHits / docCount, 0~1) */
  share: number;
}

export interface ReasonResult {
  /** 분석한 전체 문서 수 (YouTube 텍스트 + Instagram 캡션) */
  docCount: number;
  /** YouTube 제목·설명 문서 수 */
  ytDocCount?: number;
  /** Instagram 캡션 문서 수 */
  igDocCount?: number;
  totalMatches: number;
  /** 최상위 카테고리가 최소 언급 문서 수를 넘겼는지 (표본 신뢰도) */
  confident: boolean;
  /** 가장 많이 언급된 카테고리 라벨 (신뢰도 미달이면 null) */
  dominant: string | null;
  categories: ReasonCategory[];
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
  /** 확산 이유 추정 (영상 제목·설명 텍스트마이닝). */
  reasons?: ReasonResult | null;
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
