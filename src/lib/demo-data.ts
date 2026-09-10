/**
 * 체험용(배너 QR) 고정 데이터.
 *
 * 왜 고정인가:
 *   1) 발굴 버튼을 누르면 **유튜브 API 쿼터**(하루 10,000 units)를 쓴다. 공개 링크에서
 *      아무나 누르면 하루치가 순식간에 마르고 팀이 못 쓴다.
 *   2) 발굴 결과·시드·저장 목록은 **Supabase 공용 상태**다. 방문자가 팀 데이터를 덮어쓰면 안 된다.
 *   그래서 체험 화면은 store 를 아예 붙이지 않고 이 파일만 읽는다 — 읽기도 쓰기도 없다.
 *
 * ⚠️ 지어낸 수치가 아니다. 둘 다 **실제 발굴 결과에서 그대로 가져온 스냅샷**이다.
 *    - 국내: 배너에 실린 그 5건(황치즈 스낵). QR 로 들어온 사람이 배너에서 본 키워드를
 *      그대로 화면에서 다시 보게 하려고 같은 세트를 쓴다.
 *    - 해외: 2026-08-11 발굴분에서 **식품 맥락 후보만 골라냈다**. 같은 회차에 잡힌
 *      `janmashtami`·`comedy`·`fun` 같은 인도 명절어·일반어는 뺐다 — 발굴기의 알려진
 *      노이즈라 체험 화면에서 제품 후보처럼 보이면 안 된다.
 *    수치를 바꾸지 말 것. 바꾸면 실제 화면과 다른 걸 보여주는 게 된다.
 */

export type DemoTier = 1 | 2;

/** 배지 — 실제 화면의 배지 규칙을 그대로 쓴다(그린은 상승·통과·완료에만). */
export type DemoBadge = "트렌드" | "구매↑" | "상승세" | "유튜브+검색" | "유튜브" | "검색";

export interface DemoDomesticRow {
  rank: number;
  tier: DemoTier;
  name: string;
  /** 전주 대비 상승률(%) */
  riseRate: number;
  /** 월 검색량 */
  volume: number;
  status: "급상승" | "상승";
  /** 4주 흐름 패턴 라벨 */
  pattern: string;
  /** 패턴이 상승 방향인가 — 그린 텍스트 여부 */
  patternUp: boolean;
  score: number;
  badges: DemoBadge[];
}

/** 국내 트렌드 — 배너에 실린 그 회차(황치즈 정복 스낵). */
export const DEMO_DOMESTIC: DemoDomesticRow[] = [
  {
    rank: 1,
    tier: 1,
    name: "미쯔 황치즈",
    riseRate: 142,
    volume: 33000,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 96,
    badges: ["트렌드", "구매↑", "유튜브+검색"],
  },
  {
    rank: 2,
    tier: 1,
    name: "청우 황치즈스틱",
    riseRate: 97,
    volume: 12400,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 90,
    badges: ["트렌드", "구매↑", "유튜브"],
  },
  {
    rank: 3,
    tier: 1,
    name: "두바이쫀득쿠키",
    riseRate: 85,
    volume: 9300,
    status: "급상승",
    pattern: "하락 후 반등",
    patternUp: false,
    score: 84,
    badges: ["트렌드", "유튜브"],
  },
  {
    rank: 4,
    tier: 2,
    name: "황치즈스틱",
    riseRate: 58,
    volume: 21000,
    status: "상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 79,
    badges: ["상승세", "유튜브+검색"],
  },
  {
    rank: 5,
    tier: 2,
    name: "황치즈칩쿠키",
    riseRate: 62,
    volume: 6700,
    status: "상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 74,
    badges: ["상승세", "검색"],
  },
];

export interface DemoOverseasRow {
  rank: number;
  tier: DemoTier;
  term: string;
  /** 급증 배수 — 과거 기준선 대비 최근 이 말을 쓴 채널이 몇 배 늘었나 */
  lift: number;
  /** 최근 이 말이 제목에 등장한 영상 수 */
  videos: number;
  /** 그 영상이 퍼진 채널 수 */
  channels: number;
  /** 참고용 조회수 합 (순위에는 안 쓴다) */
  views: number;
  novel: boolean;
  /** 실제 영상 제목 하나 */
  example: string;
}

/**
 * 해외 트렌드 — 2026-08-11 발굴분(US·GB).
 * 한 트렌드(크루아상 × 매그넘)가 여러 형태로 함께 잡힌 회차라 체험용으로 이야기가 선다.
 */
export const DEMO_OVERSEAS: DemoOverseasRow[] = [
  {
    rank: 1,
    tier: 1,
    term: "croissant",
    lift: 4.6,
    videos: 14,
    channels: 13,
    views: 11094526,
    novel: true,
    example: "The viral Magnum croissant trend🤌 10/10 #dubaireels #viralmagnumtrend #desserts",
  },
  {
    rank: 2,
    tier: 2,
    term: "magnum",
    lift: 2.7,
    videos: 12,
    channels: 11,
    views: 15124572,
    novel: true,
    example: "Viral Croissant & Magnum ice cream 🥐🍨 #viral #trending #youtubeshorts #shorts",
  },
  {
    rank: 3,
    tier: 2,
    term: "donuts",
    lift: 2.5,
    videos: 25,
    channels: 15,
    views: 6712159,
    novel: false,
    example: "How to make donuts diffrently - foodiebeats tiktok trend - fun for kids 🍩",
  },
  {
    rank: 4,
    tier: 2,
    term: "magnum croissant",
    lift: 2.1,
    videos: 7,
    channels: 6,
    views: 6136221,
    novel: true,
    example: "The viral Magnum croissant trend🤌 10/10 #dubaireels #viralmagnumtrend #desserts",
  },
];

/** 이 스냅샷을 뜬 발굴 시각 — 화면 상단에 그대로 표시한다(지금 시각인 척하지 않는다). */
export const DEMO_DISCOVERED_AT = "2026.08.11 17:16";
