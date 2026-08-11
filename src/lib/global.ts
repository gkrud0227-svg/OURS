import type { ReasonResult } from "./types";
import type { CoTerm } from "./cooccurrence";

export const GLOBAL_REGIONS: { code: string; label: string; note?: string }[] = [
  { code: "US", label: "미국" },
  { code: "GB", label: "영국" },
  { code: "JP", label: "일본" },
  { code: "FR", label: "프랑스" },
  { code: "DE", label: "독일" },
  {
    code: "CN",
    label: "중국어권",
    note: "중국 본토는 YouTube가 차단돼 있어 대만·홍콩·화교권 중국어 콘텐츠 신호입니다. 샤오홍슈·도우인은 공개 API가 없습니다.",
  },
];

/**
 * 국가별 기본 시드 — 시드 언어가 코퍼스 언어를 정한다.
 *
 * ⚠️ 반드시 **의도어**(viral/trending/new · 网红/爆火/新品)를 붙일 것.
 *    `dessert`만 넣으면 신규 업로드가 무작위라 트렌드어가 0건 잡힌다.
 *    `viral dessert`로 바꾸면 같은 조건에서 11건이 잡힌다.
 */
export const SEED_PRESETS: Record<string, string[]> = {
  // 발굴형 시드 — 맛·카테고리를 지정하지 않는 **중립 의도어**만.
  // 특정 트렌드(과일+매운맛 등)를 미리 고르지 않고, "지금 뜨는 음식"을 넓게 검색해
  // 그 제목에서 최근 급확산 단어(lift)를 엔진이 알아서 뽑게 한다. 여러 각도(시의성·
  // 바이럴·플랫폼·레시피·추천)로 섞어 코퍼스 편향을 줄인다.
  en: [
    "food trend 2026", // 시의성 — "올해 뜰 음식" 영상에서 신규어가 명명됨
    "viral food", // 바이럴 각도
    "tiktok food trend", // 플랫폼 각도 — 틱톡발 트렌드가 유튜브 컴필로 유입(맛 중립)
    "trending recipe", // 레시피 각도 — 창작자가 신규 조합을 올림
    "food you have to try", // 추천 각도 — "꼭 먹어봐야 할" 신규어 등장
  ],
  zh: ["网红甜点", "爆火零食", "新品烘焙", "美食趋势"],
  ko: ["신상 디저트", "유행 간식", "신제품 베이커리", "먹거리 트렌드"],
};

export interface GlobalResult {
  keyword: string;
  region: string;
  windowDays: number;
  youtube: {
    videoCount: number;
    sampled: number;
    avgViews: number;
    shortCount: number;
    topVideo: { videoId: string; title: string; channel: string; views: number } | null;
  };
  counts: { yt: number; ig: number; total: number; droppedByLang?: number };
  ytError?: string;
  reasons: ReasonResult;
  coTerms: CoTerm[];
}

export interface DiscoverCandidate {
  term: string;
  /** 최근 코퍼스에서 이 용어를 쓴 **채널 수** (영상 수가 아니다) */
  dfRecent: number;
  /** 과거 베이스라인에서 이 용어를 쓴 채널 수 */
  dfBaseline: number;
  /** 최근 코퍼스에서 이 용어가 등장한 **영상(제목) 수** — 채널 수와 별개 */
  videosRecent?: number;
  /** 급증 배수 = 최근 채널 비율 ÷ 과거 채널 비율. 점수는 이것 하나로 매긴다. */
  lift: number;
  /** 참고용 조회수 합. 점수에는 쓰지 않는다 — 조회수 가중은 일반어를 끌어올린다. */
  views: number;
  score: number;
  hashtag: boolean;
  /** 과거 베이스라인에 한 번도 없던 용어 = 신조어 후보 */
  novel: boolean;
  /** 이 용어가 실제로 등장한 영상 제목 예시 (관련성 판단용) */
  examples: string[];
  /** 식품 맥락 소프트 신호 — 제거가 아니라 순위 조정용 */
  contextTag: "food" | "neutral" | "nonfood";
  /** 이 용어가 등장한 제목 중 식품어를 포함한 비율 (0~1) */
  foodShare: number;
}

export interface DiscoverResult {
  region: string;
  locale: "ko" | "en" | "zh";
  seeds: string[];
  window: { recentDays: number; baselineStartDays: number; baselineEndDays: number };
  counts: {
    recentDocs: number;
    baselineDocs: number;
    recentChannels: number;
    baselineChannels: number;
    droppedByLang: number;
    terms: number;
  };
  quotaUnits: number;
  ytError?: string;
  candidates: DiscoverCandidate[];
  /** SNS 확산 흐름 — 최근 영상 제목·설명 전체에서 집계한 확산 이유(테마) 분포. */
  flow?: ReasonResult;
}

async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    const e = json as { error?: string; detail?: string };
    throw new Error(e?.detail ? `${e.error ?? fallback} (${e.detail})` : (e?.error ?? fallback));
  }
  return json as T;
}

export function fetchGlobal(keyword: string, region: string): Promise<GlobalResult> {
  return post<GlobalResult>("/api/global", { keyword, region }, "해외 분석에 실패했습니다.");
}

export function fetchDiscover(seeds: string[], region: string): Promise<DiscoverResult> {
  return post<DiscoverResult>(
    "/api/global/discover",
    { seeds, region },
    "해외 발굴에 실패했습니다.",
  );
}
