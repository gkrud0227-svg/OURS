export interface OdmItem {
  company: string;
  product: string;
  foodType: string;
  /** YYYYMMDD */
  reportDate: string;
  /** 생산종료여부 원본값 */
  production: string;
  shelfLife: string;
  industry: string;
  form: string;
  reportNo: string;
}

export interface OdmResponse {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: OdmItem[];
  notice?: string;
  /** 밤에 미리 받아둔 자료로 응답했는가 (제한 시간대 폴백) */
  cached?: boolean;
  cachedAt?: string | null;
  cachedQuery?: string;
}

/** 캐시 조회 시각을 "7/23 21:07 (14시간 전)" 형태로. */
export function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const stamp = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (hours < 1) return `${stamp} (방금)`;
  if (hours < 24) return `${stamp} (${hours}시간 전)`;
  return `${stamp} (${Math.floor(hours / 24)}일 전)`;
}

export class OdmKeyError extends Error {}

/** 트렌드 카테고리 → 식품안전나라 품목유형명 후보. */
export const FOOD_TYPE_PRESETS: { label: string; types: string[] }[] = [
  { label: "베이커리", types: ["빵류", "떡류", "과자"] },
  { label: "과자·스낵", types: ["과자", "캔디류"] },
  { label: "초콜릿·코코아", types: ["초콜릿가공품"] },
  { label: "아이스크림·빙과", types: ["아이스크림류", "빙과류"] },
  { label: "음료", types: ["탄산음료", "혼합음료", "커피", "액상차"] },
  { label: "유가공·크림", types: ["가공유류", "발효유류", "식물성크림"] },
  { label: "잼·시럽", types: ["잼류", "당류가공품"] },
];

/**
 * 대시보드 카테고리 → 식품안전나라 대표 품목유형.
 * 트렌드 화면에서 "이 카테고리로 ODM 스크리닝"으로 넘어올 때 쓴다.
 */
export const CATEGORY_TO_FOOD_TYPE: Record<string, string> = {
  베이커리: "빵류",
  디저트: "과자",
  스낵: "과자",
  음료: "혼합음료",
};

/**
 * 트렌드 키워드 → 식품안전나라 품목유형 추론.
 *
 * 발굴 화면에 뜨는 건 "두바이초콜릿", "밤티라미수" 같은 제품명이라 품목유형이 아니다.
 * 품목제조보고는 공식 분류명(빵류·초콜릿류…)으로만 검색되므로, 키워드에 든 단서로
 * 대표 유형을 추정해 ODM 스크리닝으로 넘긴다.
 *
 * 앞쪽 규칙이 우선한다 — "초코소금빵"은 빵으로 봐야지 초콜릿류로 가면 안 된다.
 * 확신이 없으면 null 을 돌려주고, 화면에서 사용자가 직접 고르게 한다.
 */
const FOOD_TYPE_HINTS: { type: string; pattern: RegExp }[] = [
  {
    type: "빵류",
    pattern:
      /빵|베이글|크루아상|크로플|도넛|도너츠|바게트|브레드|번$|스콘|카스테라|카스텔라|소금빵|식빵|호빵|찐빵|앙버터|모닝롤|롤케이크|롤케익|번스|브리오슈|치아바타|프레첼|와플|머핀|파운드|시나몬롤|베이커리/,
  },
  // 약과·한과는 떡류가 아니라 과자류로 분류되므로 여기 넣지 않는다.
  { type: "떡류", pattern: /떡|모찌|찹쌀|인절미|경단|앙금|시루|가래|백설기|절편|송편/ },
  {
    type: "아이스크림류",
    pattern: /아이스크림|아이스께끼|젤라또|젤라토|소프트콘|소프트아이스|하드바|빙수|빙과|팥빙수|셔벗|샤베트/,
  },
  // 실데이터 분류명은 "초콜릿류"가 아니라 "초콜릿가공품"이다 (I1250 캐시로 확인).
  { type: "초콜릿가공품", pattern: /초콜릿|초콜렛|초코|쇼콜라|카카오|가나슈|봉봉|트러플|두바이초코|두바이쫀득/ },
  {
    type: "캔디류",
    pattern: /젤리|캔디|캔디바|사탕|구미|마시멜로|누가|카라멜|캐러멜|롤리팝|막대사탕|탕후루|하리보/,
  },
  {
    type: "음료류",
    pattern:
      /음료|주스|쥬스|에이드|스무디|라떼|라테|커피|아메리카노|티$|차$|밀크티|버블티|버블차|우롱|말차|콤부차|식혜|스파클링|탄산|콜라|사이다|프라페|프라푸치노|모카|카페라떼|아인슈페너/,
  },
  // 실데이터 분류명은 "과자류"가 아니라 "과자"다 (I1250 캐시로 확인).
  {
    type: "과자",
    pattern:
      /과자|쿠키|비스킷|비스켓|스낵|칩$|칩스|크래커|파이|타르트|케이크|케익|티라미수|마카롱|약과|한과|유과|전병|팝콘|누네띠네|다쿠아즈|휘낭시에|피낭시에|까눌레|카눌레|비스코티|양갱/,
  },
  {
    type: "면류",
    pattern: /라면|우동|국수|칼국수|짜장|짬뽕|파스타|스파게티|냉면|막국수|당면|쌀국수|볶음면|비빔면/,
  },
  { type: "잼류", pattern: /잼$|잼류|스프레드|시럽|꿀$|메이플|누텔라|땅콩버터/ },
  {
    type: "가공유류",
    pattern: /우유|요거트|요구르트|치즈|버터|생크림|크림$|크림치즈|연유|밀크|그릭요거트|요아정/,
  },
  {
    type: "즉석조리식품",
    pattern: /도시락|김밥|삼각김밥|주먹밥|덮밥|비빔밥|볶음밥|컵밥|즉석밥|밀키트|간편식|가정간편식|hmr/i,
  },
  {
    type: "커피",
    pattern: /원두|드립백|콜드브루|캡슐커피|스틱커피|믹스커피/,
  },
];

export function guessFoodType(term: string): string | null {
  const t = (term ?? "").replace(/\s+/g, "");
  if (!t) return null;
  for (const { type, pattern } of FOOD_TYPE_HINTS) {
    if (pattern.test(t)) return type;
  }
  return null;
}

/**
 * 기존 거래(또는 컨택 중인) ODM 제조사.
 *
 * 식품유형 역검색 결과에서 이 업체들을 맨 위로 올리고 "기존 거래" 배지를 단다.
 * 상호가 공장·법인 형태로 길게 등록되므로(예: "에스피씨삼립(주) 대구공장")
 * 부분 매칭한다. 거래처가 바뀌면 이 배열만 고치면 된다.
 */
export const KNOWN_PARTNERS = [
  "삼립",
  "디엔비",
  "리빙라이프",
  "비엘에프씨",
  "엠에스씨",
  "영의정",
  "유성씨앤에프",
  "서울식품공업",
  "하이원푸드",
];

/** 업체명(길게 등록된 상호)이 기존 거래처인지 부분 매칭으로 판정. */
export function isKnownPartner(company: string): boolean {
  const c = (company ?? "").replace(/\s+/g, "").toLowerCase();
  if (!c) return false;
  return KNOWN_PARTNERS.some((p) => c.includes(p.replace(/\s+/g, "").toLowerCase()));
}

/**
 * 생산종료여부 원본값 → 화면 표시. API 값이 표기마다 달라 문자열로 판정한다.
 *
 * ⚠️ 이 필드는 "생산종료여부"다 — 값의 의미가 뒤집혀 있다.
 *   "예"/"Y"   = 생산종료 O = 생산 안 함
 *   "아니오"/"N" = 생산종료 X = 생산 중   ← 실측: 삼립 3267건 전부 "아니오"
 * "아니오"의 "니오"가 종료 패턴에 오검출되지 않도록 부정형을 먼저 판정한다.
 */
export function productionState(raw: string): {
  label: string;
  tone: "good" | "bad" | "unknown";
} {
  const v = (raw ?? "").trim();
  if (!v) return { label: "미표기", tone: "unknown" };
  // 부정형(종료 아님 = 생산 중)을 먼저 본다.
  if (/^(아니오|아니요|미종료|N)$/i.test(v)) return { label: "생산중", tone: "good" };
  if (/^(예|종료|중단|폐업|Y)$/i.test(v) || /종료|중단|폐업/.test(v)) {
    return { label: "생산종료", tone: "bad" };
  }
  if (/생산|정상/.test(v)) return { label: "생산중", tone: "good" };
  return { label: v, tone: "unknown" };
}

export function formatReportDate(raw: string): string {
  const v = (raw ?? "").replace(/[^0-9]/g, "");
  if (v.length < 8) return raw || "—";
  return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}`;
}

export async function fetchOdm(params: {
  company?: string;
  foodType?: string;
  product?: string;
  page?: number;
  maxRows?: number;
}): Promise<OdmResponse> {
  const res = await fetch("/api/odm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    const e = json as { error?: string; detail?: string; needsKey?: boolean };
    const message = e?.error ?? "ODM 조회에 실패했습니다.";
    if (e?.needsKey) throw new OdmKeyError(message);
    throw new Error(e?.detail ? `${message} (${e.detail})` : message);
  }
  return json as OdmResponse;
}

/** 거래처 카탈로그를 한 번에 받아올 최대 건수. 매일 크론이 채운 완전한 캐시에서 서빙되므로
 * 식약처 1회 제한(1000)을 넘겨도 된다 — 대형 거래처(3천~4천건) 전체를 받는다. */
const PARTNER_CATALOG_LIMIT = 5000;

/**
 * 제품명·식품유형 조회를 **기존 거래처(KNOWN_PARTNERS) 안에서만** 수행한다.
 *
 * 식약처 API는 "업체명 단독" 조회만 안정적으로 허용한다(제품명·유형 단독, 두 필터
 * 결합은 서버가 막거나 빈 응답을 준다). 그래서 파트너마다 **업체명으로 카탈로그를
 * 받아** 클라이언트에서 제품명/유형 키워드로 거른다. 이 방식은 제한 시간대(09~19시)
 * 에도 동작한다 — 업체명 단독 조회는 그 시간에도 열려 있기 때문.
 */
export async function fetchOdmPartners(
  filter: { product?: string; foodType?: string },
  partners: string[] = KNOWN_PARTNERS,
): Promise<OdmResponse> {
  const byProduct = filter.product != null;
  const kw = (filter.product ?? filter.foodType ?? "").trim().toLowerCase();

  const settled = await Promise.allSettled(
    partners.map((p) => fetchOdm({ company: p, maxRows: PARTNER_CATALOG_LIMIT })),
  );

  const items: OdmItem[] = [];
  let cached = false;
  let cachedAt: string | null = null;
  let anyOk = false;
  let capped = false;
  let keyErr: OdmKeyError | null = null;
  let lastErr: Error | null = null;

  for (const s of settled) {
    if (s.status === "fulfilled") {
      anyOk = true;
      if (s.value.hasMore) capped = true; // 카탈로그가 1000건을 넘겨 일부만 검색됨
      const matched = s.value.items.filter((it) =>
        (byProduct ? it.product : it.foodType).toLowerCase().includes(kw),
      );
      items.push(...matched);
      if (s.value.cached) {
        cached = true;
        cachedAt = s.value.cachedAt ?? cachedAt;
      }
    } else if (s.reason instanceof OdmKeyError) {
      keyErr = s.reason;
    } else if (s.reason instanceof Error) {
      lastErr = s.reason;
    }
  }

  // 파트너 전부 실패 = 키 문제거나 서버 오류. 대표 에러를 그대로 올린다.
  if (!anyOk) {
    if (keyErr) throw keyErr;
    throw lastErr ?? new Error("조회에 실패했습니다.");
  }

  const notices: string[] = [];
  if (cached) notices.push("일부는 미리 받아둔 자료입니다.");
  if (capped) notices.push(`품목이 많은 거래처는 최근 ${PARTNER_CATALOG_LIMIT}건 내에서 검색했습니다.`);

  return {
    total: items.length,
    page: 1,
    pageSize: items.length,
    hasMore: false,
    items,
    cached,
    cachedAt: cached ? cachedAt : undefined,
    notice: notices.join(" ") || undefined,
  };
}

/* ---------- 후보 리스트 (컨택 상태 관리) ---------- */

export type ContactStatus = "none" | "contacted" | "inprogress" | "rejected";

export const CONTACT_META: Record<
  ContactStatus,
  { label: string; tone: "muted" | "good" | "mid" | "bad" }
> = {
  none: { label: "미컨택", tone: "muted" },
  contacted: { label: "컨택완료", tone: "mid" },
  inprogress: { label: "진행중", tone: "good" },
  rejected: { label: "거절", tone: "bad" },
};

export interface OdmCandidate {
  company: string;
  /** 이 업체에서 컨택 대상이 된 구체 제품명. 업체 단위로 저장했으면 빈 문자열. */
  product: string;
  /** 저장 당시 근거가 된 카테고리/검색어 */
  note: string;
  status: ContactStatus;
  savedAt: string;
}

/** 후보 식별 키 — 같은 업체라도 제품이 다르면 별개 후보로 관리한다. */
export function candidateKey(company: string, product: string): string {
  return `${company} ${product ?? ""}`;
}

export const ODM_STORAGE_KEY = "td.odm.candidates.v1";

export function loadCandidates(): OdmCandidate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ODM_STORAGE_KEY);
    if (!raw) return [];
    // 구버전(제품 필드 없음) 후보도 안전하게 읽는다.
    return (JSON.parse(raw) as OdmCandidate[]).map((c) => ({ ...c, product: c.product ?? "" }));
  } catch {
    return [];
  }
}

export function saveCandidates(list: OdmCandidate[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ODM_STORAGE_KEY, JSON.stringify(list));
}
