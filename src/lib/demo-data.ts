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

/**
 * 배지 — 실제 화면의 배지 규칙을 그대로 쓴다(그린은 상승·통과·완료에만).
 *
 * 배지가 말하는 건 두 가지뿐이다.
 *   1) **규모**  — 이 상승이 월 검색량으로 뒷받침되는가(`검색량 확인` / `검색량 미확인`)
 *   2) **출처**  — 어디서 발굴했는가(`유튜브+검색` / `유튜브` / `검색`)
 *   그리고 쇼핑 클릭까지 오른 후보에만 `구매 상승` 이 붙는다.
 * ⚠️ 급상승·상승은 **티어 밴드가 말한다**. 배지로 반복하지 않는다.
 */
export type DemoBadge =
  | "검색량 확인"
  | "검색량 미확인"
  | "구매 상승"
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
    badges: ["검색량 확인", "유튜브+검색"],
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
    badges: ["검색량 확인", "유튜브"],
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
    badges: ["검색량 확인", "유튜브"],
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
    badges: ["검색량 미확인", "구매 상승", "검색"],
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
    badges: ["검색량 미확인", "구매 상승", "유튜브"],
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
    badges: ["검색량 미확인", "구매 상승", "검색"],
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
    badges: ["검색량 미확인", "구매 상승", "유튜브"],
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
    badges: ["검색량 확인", "유튜브"],
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
    badges: ["검색량 확인", "유튜브"],
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
    badges: ["검색량 확인", "유튜브"],
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
    badges: ["검색량 확인", "유튜브"],
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
  /** 국내 유입 판정 — 기회 / 후보 / 성숙 */
  inflow: "기회" | "후보" | "성숙";
  /** 국내 검색에 쓴 한글 표기 */
  spelling: string;
  /** 실제 영상 제목 하나 */
  example: string;
}

/**
 * 해외 트렌드 — 2026-09-10 회차(US·GB).
 *
 * ⚠️ 이 회차가 체험용으로 좋은 이유: **재료는 국내에 있는데 조합은 아직 안 왔다**는 게
 *    판정으로 그대로 드러난다. `크로와상`·`매그넘` 은 각각 국내에 이미 자리 잡아 성숙이고,
 *    그 조합인 `크루아상 매그넘` 은 국내 검색이 아직 없어 후보다. 이게 해외 화면이
 *    존재하는 이유 자체라 한 화면으로 설명이 된다.
 * ⚠️ 같은 회차의 뉴스 소스 후보(`referring`→"발작이", `relieved`→"라이기트의")와
 *    표기를 못 찾은 `판정 불가` 후보는 뺐다 — 표기 변환기의 알려진 오탐이라 제품
 *    후보처럼 보이면 안 된다.
 */
export const DEMO_OVERSEAS: DemoOverseasRow[] = [
  {
    rank: 1,
    tier: 1,
    term: "croissant",
    lift: 6.7,
    videos: 16,
    channels: 16,
    views: 8906000,
    novel: true,
    inflow: "성숙",
    spelling: "크로와상",
    example: "The viral Magnum croissant trend🤌 10/10 #dubaireels #viralmagnumtrend #desserts",
  },
  {
    rank: 2,
    tier: 2,
    term: "magnum",
    lift: 3.3,
    videos: 8,
    channels: 8,
    views: 6111000,
    novel: true,
    inflow: "성숙",
    spelling: "매그넘",
    example: "The viral Magnum croissant trend🤌 10/10 #dubaireels #viralmagnumtrend #desserts",
  },
  {
    rank: 3,
    tier: 2,
    term: "croissant magnum",
    lift: 2.2,
    videos: 6,
    channels: 6,
    views: 14009000,
    novel: true,
    inflow: "후보",
    spelling: "크루아상 매그넘",
    example: "Viral Croissant & Magnum ice cream 🥐🍨 #viral #trending #youtubeshorts #shorts",
  },
  {
    rank: 4,
    tier: 2,
    term: "magnum croissant",
    lift: 2.1,
    videos: 5,
    channels: 5,
    views: 6085000,
    novel: true,
    inflow: "후보",
    spelling: "매그넘 크루아상",
    example: "The viral Magnum croissant trend🤌 10/10 #dubaireels #viralmagnumtrend #desserts",
  },
];

/** 국내 유입 판정 뜻 — 실제 화면(GROUP_META)과 같은 말을 쓴다. */
export const DEMO_INFLOW_DESC: Record<DemoOverseasRow["inflow"], string> = {
  기회: "국내도 오르기 시작했는데 아직 규모가 작다 — 지금 움직일 대상",
  후보: "해외는 뜨는데 국내 검색은 아직 없다 — 지켜볼 대상",
  성숙: "국내에 이미 자리 잡았다 — 라인 확장·프리미엄화는 가능",
};

/**
 * 스냅샷을 뜬 발굴 시각 — 화면 상단에 그대로 표시한다(지금 시각인 척하지 않는다).
 * ⚠️ 국내·해외를 따로 둔다. 한 상수로 묶으면 한쪽만 새로 뽑았을 때 다른 쪽이 남의 날짜를
 *    자기 것처럼 표시하게 된다.
 */
export const DEMO_DOMESTIC_AT = "2026.09.10 10:48";
export const DEMO_OVERSEAS_AT = "2026.09.10 14:34";

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

/**
 * 키워드별 확산 이유 — 그 키워드가 나온 **인기 영상의 시청자 댓글**을 사전으로 집계한 것.
 *
 * ⚠️ 실제 값이다. 2026-09-10 회차 후보 11개를 실제 대시보드에서 하나씩 돌려(키워드당 약
 *    104 units) 받은 결과를 그대로 옮겼다. 지어낸 태그가 아니다.
 * ⚠️ `토마토`는 카테고리가 0건이다. **비워 두는 게 맞다** — 이유를 못 찾은 것이지 이유가
 *    없는 게 아니고, 억지로 채우면 "댓글 기반"이라는 말이 거짓이 된다. 화면도 실제와 같이
 *    "뚜렷한 이유 신호가 없어요"로 그린다.
 * ⚠️ `docHits`(언급 영상 수)가 3 미만이면 실제 화면이 "표본이 얇아 참고용"이라고 덧붙인다.
 *    같은 문턱(MIN_DOC_HITS)을 체험에서도 쓴다.
 */
export interface DemoReasonCategory {
  label: string;
  /** 이 카테고리 단어가 하나라도 나온 댓글 수 */
  docHits: number;
  /** 언급 비율(%) — 실제 화면이 반올림해 보여주는 값 그대로 */
  sharePct: number;
  /** 실제로 잡힌 상위 단어 */
  words: string[];
}

export interface DemoReason {
  /** 집계에 쓴 댓글 수 */
  comments: number;
  /** 집계에 쓴 영상 수 */
  videos: number;
  /** 대표 이유 — 표본이 얇으면 null */
  dominant: string | null;
  categories: DemoReasonCategory[];
}

export const DEMO_REASONS: Record<string, DemoReason> = {
  민음사빵: {
    comments: 328,
    videos: 4,
    dominant: "희소성",
    categories: [
      { label: "희소성", docHits: 7, sharePct: 2, words: ["품절", "대란", "못구"] },
      { label: "비주얼·인증샷", docHits: 3, sharePct: 1, words: ["예쁘", "비주얼", "감성"] },
      { label: "맛 궁합", docHits: 2, sharePct: 1, words: ["어울리"] },
      { label: "식감", docHits: 2, sharePct: 1, words: ["부드럽", "말랑"] },
      { label: "계절 연상", docHits: 1, sharePct: 0, words: ["더위"] },
    ],
  },
  한정선: {
    comments: 400,
    videos: 4,
    dominant: "희소성",
    categories: [
      { label: "희소성", docHits: 48, sharePct: 12, words: ["한정"] },
      { label: "비주얼·인증샷", docHits: 18, sharePct: 5, words: ["감성", "예쁘", "비주얼"] },
      { label: "계절 연상", docHits: 3, sharePct: 1, words: ["겨울", "따뜻한", "복날"] },
    ],
  },
  민음사: {
    comments: 400,
    videos: 4,
    dominant: "맛 궁합",
    categories: [
      { label: "맛 궁합", docHits: 3, sharePct: 1, words: ["어울리", "밸런스"] },
      { label: "비주얼·인증샷", docHits: 3, sharePct: 1, words: ["감성", "예쁘"] },
      { label: "계절 연상", docHits: 1, sharePct: 0, words: ["시원"] },
      { label: "희소성", docHits: 1, sharePct: 0, words: ["한정"] },
    ],
  },
  "롯데 군위사과": {
    comments: 139,
    videos: 4,
    dominant: "식감",
    categories: [
      { label: "식감", docHits: 5, sharePct: 4, words: ["쫀득", "쫄깃", "바삭"] },
      { label: "비주얼·인증샷", docHits: 2, sharePct: 1, words: ["예쁘"] },
      { label: "희소성", docHits: 2, sharePct: 1, words: ["품절", "대란"] },
      { label: "맛 궁합", docHits: 1, sharePct: 1, words: ["어울리"] },
    ],
  },
  군위사과: {
    comments: 328,
    videos: 4,
    dominant: "식감",
    categories: [
      { label: "식감", docHits: 5, sharePct: 2, words: ["쫀득", "쫄깃", "바삭"] },
      { label: "희소성", docHits: 3, sharePct: 1, words: ["품절", "대란"] },
      { label: "맛 궁합", docHits: 3, sharePct: 1, words: ["고소", "달콤", "어울리"] },
      { label: "비주얼·인증샷", docHits: 2, sharePct: 1, words: ["예쁘"] },
      { label: "계절 연상", docHits: 1, sharePct: 0, words: ["시원"] },
    ],
  },
  "한정선 요거트 찹쌀떡": {
    comments: 300,
    videos: 4,
    dominant: "희소성",
    categories: [
      { label: "희소성", docHits: 32, sharePct: 11, words: ["한정"] },
      { label: "비주얼·인증샷", docHits: 10, sharePct: 3, words: ["예쁘", "비주얼"] },
      { label: "식감", docHits: 5, sharePct: 2, words: ["쫄깃", "쫀득", "말랑"] },
      { label: "맛 궁합", docHits: 4, sharePct: 1, words: ["달콤", "달달"] },
      { label: "계절 연상", docHits: 1, sharePct: 0, words: ["시원"] },
    ],
  },
  요거트찹쌀떡: {
    comments: 290,
    videos: 4,
    dominant: "비주얼·인증샷",
    categories: [
      { label: "비주얼·인증샷", docHits: 13, sharePct: 4, words: ["예쁘", "비주얼", "감성", "색감"] },
      { label: "희소성", docHits: 8, sharePct: 3, words: ["한정"] },
      { label: "식감", docHits: 4, sharePct: 1, words: ["쫀득", "바삭", "쫄깃"] },
    ],
  },
  고구마: {
    comments: 154,
    videos: 4,
    dominant: "계절 연상",
    categories: [
      { label: "계절 연상", docHits: 4, sharePct: 3, words: ["시원"] },
      { label: "식감", docHits: 1, sharePct: 1, words: ["쫄깃"] },
      { label: "맛 궁합", docHits: 1, sharePct: 1, words: ["달콤"] },
    ],
  },
  토마토: {
    comments: 400,
    videos: 4,
    dominant: null,
    categories: [],
  },
  무화과: {
    comments: 197,
    videos: 4,
    dominant: null,
    categories: [
      { label: "맛 궁합", docHits: 2, sharePct: 1, words: ["달콤", "달달"] },
      { label: "계절 연상", docHits: 2, sharePct: 1, words: ["따뜻한", "겨울"] },
      { label: "비주얼·인증샷", docHits: 1, sharePct: 1, words: ["때깔"] },
    ],
  },
  찹쌀떡: {
    comments: 381,
    videos: 4,
    dominant: "식감",
    categories: [
      { label: "식감", docHits: 16, sharePct: 4, words: ["쫀득", "말랑", "바삭", "꾸덕"] },
      { label: "맛 궁합", docHits: 4, sharePct: 1, words: ["고소", "어울리", "단짠"] },
      { label: "희소성", docHits: 3, sharePct: 1, words: ["품절"] },
      { label: "비주얼·인증샷", docHits: 2, sharePct: 1, words: ["비주얼", "예쁘"] },
      { label: "계절 연상", docHits: 1, sharePct: 0, words: ["여름"] },
    ],
  },
};

/** 이 개수 미만으로 언급되면 실제 화면이 "표본이 얇아 참고용"이라고 덧붙인다. */
export const DEMO_MIN_DOC_HITS = 3;
