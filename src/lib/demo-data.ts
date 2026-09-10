/**
 * 체험용(배너 QR) 고정 데이터.
 *
 * 왜 고정인가:
 *   1) 발굴 버튼을 누르면 **유튜브 API 쿼터**(하루 10,000 units)를 쓴다. 공개 링크에서
 *      아무나 누르면 하루치가 순식간에 마르고 팀이 못 쓴다.
 *   2) 발굴 결과·시드·저장 목록은 **Supabase 공용 상태**다. 방문자가 팀 데이터를 덮어쓰면 안 된다.
 *   그래서 체험 화면은 store 를 아예 붙이지 않고 이 파일만 읽는다 — 읽기도 쓰기도 없다.
 *
 * ⚠️ 지어낸 수치가 아니다. 둘 다 **실제 발굴 결과에서 그대로 가져온 스냅샷**이고,
 *    고른 것은 진짜 · 순서와 개수는 조정 · 숫자는 그대로가 원칙이다.
 *    - 국내: 2026-09-10 발굴분에서 제품 후보만 골라냈다(아래 DEMO_DOMESTIC 주석에 제외 사유).
 *    - 해외: 2026-08-11 발굴분에서 **식품 맥락 후보만 골라냈다**. 같은 회차에 잡힌
 *      `janmashtami`·`comedy`·`fun` 같은 인도 명절어·일반어는 뺐다 — 발굴기의 알려진
 *      노이즈라 체험 화면에서 제품 후보처럼 보이면 안 된다.
 *    수치를 바꾸지 말 것. 바꾸면 실제 화면과 다른 걸 보여주는 게 된다.
 */

export type DemoTier = 1 | 2;

/** 배지 — 실제 화면의 배지 규칙을 그대로 쓴다(그린은 상승·통과·완료에만). */
export type DemoBadge =
  | "트렌드"
  | "구매↑"
  | "신규 검색어"
  | "상승세"
  | "유튜브+검색"
  | "유튜브"
  | "검색";

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

/**
 * 국내 트렌드 — 2026-09-10 10:48 발굴분에서 **골라낸 것**.
 *
 * ⚠️ 수치는 전부 그 회차가 계산한 값 그대로다(상승률·검색량·발굴점수·상태·패턴).
 *    바꾸지 말 것 — 실제 대시보드를 열었을 때 다른 값이 나오면 도구의 신뢰가 깨진다.
 * ⚠️ 24건 중 11건을 남겼다. 뺀 것과 이유:
 *    - `민음사 책갈피`(+1474%) — 굿즈다. 식품이 아니라 제품 후보가 아니다.
 *    - `멋쟁이`·`멋쟁이토마토`·`멋쟁이 토마토 가사` — 동요 가사에서 딸려 온 말.
 *    - `네이버`·`네이버지도`·`웨이팅` — 비식품 플랫폼어·일반어.
 *    - `요거트`·`복숭아`·`그릭요거트`·`요거트월드`·`토마토 마리네이드` — 하락이거나
 *      신호가 얇아 티어가 안 선다.
 * ⚠️ `고구마`·`토마토`·`무화과`는 제품명이 아니라 재료어지만 **사용자 판단으로 포함**했다.
 *    셋 다 검색 검증을 통과한 상승 후보라 TIER 2(카테고리 신호)로 들어간다.
 * ⚠️ `한정선`(단독)은 **사용자 판단으로 포함**했다. 발굴점수 82·월 검색량 71만으로 신호는
 *    가장 두껍지만, 이 말이 무엇을 가리키는지는 발굴 데이터로 확인되지 않았다(확산 흐름·
 *    확산 이유가 모두 비어 있었다). 발표 자리에서 "이게 뭔가" 질문이 나올 수 있는 행이다.
 * ⚠️ 정렬은 **발굴점수순**이다(실제 화면의 정렬 옵션 중 하나). 상승률순으로 두면 검색량이
 *    확인 안 된 신조어가 위로 올라와 첫 줄이 빈 칸(—)으로 시작한다.
 */
export const DEMO_DOMESTIC: DemoDomesticRow[] = [
  {
    rank: 1,
    tier: 1,
    name: "민음사빵",
    riseRate: 1057.0,
    volume: 425100,
    status: "급상승",
    pattern: "등락(불안정)",
    patternUp: false,
    score: 84,
    badges: ["트렌드", "유튜브+검색"],
  },
  {
    rank: 2,
    tier: 1,
    name: "한정선",
    riseRate: 36.7,
    volume: 710200,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 82,
    badges: ["트렌드", "유튜브"],
  },
  {
    rank: 3,
    tier: 1,
    name: "민음사",
    riseRate: 161.2,
    volume: 97500,
    status: "급상승",
    pattern: "등락(불안정)",
    patternUp: false,
    score: 75,
    badges: ["트렌드", "유튜브"],
  },
  {
    rank: 4,
    tier: 1,
    name: "롯데 군위사과",
    riseRate: 2978.3,
    volume: 0,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 66,
    badges: ["신규 검색어", "구매↑", "검색"],
  },
  {
    rank: 5,
    tier: 1,
    name: "군위사과",
    riseRate: 867.6,
    volume: 0,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 66,
    badges: ["신규 검색어", "구매↑", "유튜브"],
  },
  {
    rank: 6,
    tier: 1,
    name: "한정선 요거트 찹쌀떡",
    riseRate: 359.0,
    volume: 0,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 66,
    badges: ["신규 검색어", "구매↑", "검색"],
  },
  {
    rank: 7,
    tier: 1,
    name: "요거트찹쌀떡",
    riseRate: 74.9,
    volume: 0,
    status: "급상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 66,
    badges: ["신규 검색어", "구매↑", "유튜브"],
  },
  {
    rank: 8,
    tier: 2,
    name: "고구마",
    riseRate: 29.4,
    volume: 57240,
    status: "상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 60,
    badges: ["상승세", "유튜브"],
  },
  {
    rank: 9,
    tier: 2,
    name: "토마토",
    riseRate: 26.3,
    volume: 68840,
    status: "상승",
    pattern: "등락(불안정)",
    patternUp: false,
    score: 52,
    badges: ["상승세", "유튜브"],
  },
  {
    rank: 10,
    tier: 2,
    name: "무화과",
    riseRate: 16.1,
    volume: 254200,
    status: "상승",
    pattern: "등락(불안정)",
    patternUp: false,
    score: 52,
    badges: ["상승세", "유튜브"],
  },
  {
    rank: 11,
    tier: 2,
    name: "찹쌀떡",
    riseRate: 10.6,
    volume: 23430,
    status: "상승",
    pattern: "3주 연속 상승",
    patternUp: true,
    score: 38,
    badges: ["상승세", "유튜브"],
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

/**
 * 스냅샷을 뜬 발굴 시각 — 화면 상단에 그대로 표시한다(지금 시각인 척하지 않는다).
 * ⚠️ 국내·해외를 따로 둔다. 한 상수로 묶으면 한쪽만 새로 뽑았을 때 다른 쪽이 남의 날짜를
 *    자기 것처럼 표시하게 된다.
 */
export const DEMO_DOMESTIC_AT = "2026.09.10 10:48";
export const DEMO_OVERSEAS_AT = "2026.08.11 17:16";

/**
 * 체험용 컨택 후보 — 제조처 스크리닝에 미리 담겨 있는 3건.
 *
 * QR 로 처음 들어온 사람의 브라우저는 비어 있어서, 아무것도 안 담아 두면 "컨택 후보"가
 * 빈 목록으로 첫인상이 된다. 컨택 상태 관리가 이 화면의 핵심이라 **세 상태를 한 번에
 * 보여주는** 세 건을 미리 채운다(미컨택 · 컨택완료 · 진행중).
 *
 * ⚠️ 지어낸 업체가 아니다. 전부 식품안전나라 품목제조보고에 실제로 올라온 제품이고,
 *    거래처 목록(KNOWN_PARTNERS)에 있는 회사다. 셋 다 체험 랭킹의 키워드와 이어진다 —
 *    쫀득황치즈빵·옥수수 크림치즈 쫀득빵은 `황치즈`, 두바이st 쫀득 만쥬는 `두바이쫀득쿠키`.
 *    이름·업체를 바꾸면 조회 결과와 어긋나므로 그대로 둘 것.
 * ⚠️ 방문자 브라우저(localStorage)에만 들어간다. 팀 데이터와 무관하다.
 */
export const DEMO_ODM_CANDIDATES = [
  {
    company: "(주)디엔비",
    product: "쫀득황치즈빵",
    note: "황치즈 검색",
    status: "inprogress" as const,
    savedAt: "2026-08-12T02:10:00.000Z",
  },
  {
    company: "(주)디엔비",
    product: "옥수수 크림치즈 쫀득빵",
    note: "쫀득 검색",
    status: "contacted" as const,
    savedAt: "2026-08-12T02:12:00.000Z",
  },
  {
    company: "롯데웰푸드(주)",
    product: "두바이st 쫀득 만쥬",
    note: "두바이쫀득쿠키 검색",
    status: "none" as const,
    savedAt: "2026-08-12T02:15:00.000Z",
  },
];
