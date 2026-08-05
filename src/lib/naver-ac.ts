/**
 * 네이버 자동완성 발굴 소스.
 *
 * keywordstool 연관어는 시드와 **어휘가 겹치는** 것만 줘서 신조어를 놓친다.
 * 유튜브 발굴은 신조어를 잡지만 콘텐츠가 퍼진 뒤라 **늦다**(재현율 1/4).
 * 네이버 자동완성은 **어간(소금·두바이·마라)** 을 주면 사람들이 실제로 검색하는
 * **신조합 제품명**(두바이 쫀득쿠키, 박뚜기 소금빵)을 바로 돌려준다 — 검색 데이터에서
 * 신조어를 조기 발굴하는 통로다. 여기서 뽑은 후보는 기존 데이터랩 판정에 그대로 태운다.
 *
 * ⚠️ prefix(어간) 기반이라 어간조차 모르는 완전 미지어는 못 만든다. 재료·카테고리
 *    어간을 넓게 깔고 유튜브 발굴과 **상보적**으로 쓴다.
 */

import { KO_VERB_ENDING } from "./cooccurrence";

/**
 * 자동완성 발굴의 기본 시드 — 재료·카테고리 어간(제품 신조합이 붙는 자리).
 *
 * 동음이의어가 심한 맨 어간은 식품 쪽으로 좁혀 노이즈를 줄인다.
 *   마라 → 마라도나(축구), 크림 → 크림(리셀앱), 젤리 → 젤리캣(인형)·젤리슈즈
 * 이런 건 어간에서 미리 막고, 그래도 새는 비식품은 아래 비식품 게이트가 컷한다.
 */
export const DEFAULT_AC_SEEDS = [
  "소금빵",
  "두바이",
  "마라탕",
  "크림빵",
  "곰젤리",
  "초콜릿",
  "치즈볼",
  "말차",
  "흑임자",
  "약과",
  "탕후루",
  "요아정",
  "편의점 신상",
  "다이소 신상",
  "품절 대란 간식",
  "요즘 유행 간식",
];

export interface AcCandidate {
  /** 자동완성이 돌려준 완성어 (제품 신조합 후보) */
  term: string;
  /** 이 후보를 떠올린 어간 시드 */
  seed: string;
  /** 그 시드의 완성어 목록에서의 순위(1-base) — 위일수록 지금 많이 검색됨 */
  rank: number;
}

/**
 * 자동완성 응답 JSON 에서 완성어 문자열만 뽑는다 (순수 함수 · 검증 대상).
 * 응답 형태: { items: [ [ ["소금빵", ...], ["말돈소금", ...] ] ] }
 */
export function parseAutocomplete(json: unknown): string[] {
  const items = (json as { items?: unknown }).items;
  const first = Array.isArray(items) ? items[0] : undefined;
  if (!Array.isArray(first)) return [];
  return first
    .map((row) => (Array.isArray(row) ? row[0] : row))
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
}

/**
 * 정보성·비제품 꼬리말 — 이런 걸로 끝나는 완성어는 제품 신조어가 아니라 정보 검색이라 버린다.
 * (예: "두바이 여행", "탕후루 만드는법", "요아정 칼로리")
 */
const INFO_TAILS = [
  "뜻", "만드는법", "만들기", "가격", "칼로리", "레시피", "여행", "날씨", "시간",
  "위치", "주가", "환율", "성분", "효능", "부작용", "영어", "한글", "디시", "더쿠",
  "후기", "매장", "지점", "채용", "알바", "주소", "전화번호", "영업시간", "뉴스",
  // 정보성·비교성 꼬리말 — 제품명이 아니라 정보 검색 (마라탕 재료, 말차 녹차 차이, 요아정 꿀조합)
  "차이", "비교", "재료", "종류", "순위", "추천", "꿀조합", "조합", "다이어트", "파는곳", "사는곳",
];

/**
 * 비식품 게이트 — 어간 동음이의어가 끌어온 비식품 완성어를 컷한다.
 * (리셀·액세서리·인물·금융·엔터 등) 식품 화이트리스트가 아니라 **비식품 블랙리스트**라,
 * 신조어(요아정·두바이 쫀득쿠키)는 아무 신호가 없어 그대로 통과한다.
 */
const NON_FOOD_TOKENS = [
  "사이트", "홈페이지", "어플", "리셀", "중고", "시세", "주가", "코인", "환율",
  "대출", "보험", "은행", "부동산", "아파트", "청약",
  "슈즈", "신발", "운동화", "가방", "지갑", "인형", "피규어", "키링", "스티커",
  "선수", "감독", "배우", "가수", "아이돌", "영화", "드라마", "웹툰", "챌린지",
  "채용", "알바", "연봉", "면접", "자격증", "학원",
  // 교양·과학·시사 (예: "화학반응의 세계") — 음식과 무관한 콘텐츠 화제어
  "화학", "과학", "실험", "반응", "우주", "지구", "역사", "다큐", "정치", "경제", "시사",
  // 방송·편성·사업 (예: "방송편성표", "카페창업")
  "방송", "편성표", "창업", "프랜차이즈", "가맹", "매출", "폐업",
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 완성어가 비식품(동음이의 잡음)인가 — 블랙리스트 토큰 포함 여부. */
export function isNonFood(term: string): boolean {
  const t = norm(term);
  return NON_FOOD_TOKENS.some((w) => t.includes(w));
}

/**
 * 완성어 목록에서 **제품형 신조어 후보만** 남긴다.
 * - 시드 자기 자신 제외
 * - 정보성 꼬리말 제외
 * - 2글자 미만 제외, 중복 제외
 */
export function pickCandidates(seed: string, completions: string[]): AcCandidate[] {
  const s = norm(seed);
  const seen = new Set<string>();
  const out: AcCandidate[] = [];
  completions.forEach((raw, i) => {
    const term = raw.trim();
    const key = norm(term);
    if (!term || key === s) return;
    if (seen.has(key)) return;
    if (term.length < 2) return;
    if (INFO_TAILS.some((t) => term.endsWith(t))) return;
    // 활용형 어미로 끝나는 문장 조각 컷 ("멈출 수 없네", "좋아한다면", "맞혀보세요")
    if (KO_VERB_ENDING.test(term)) return;
    if (isNonFood(term)) return; // 비식품 동음이의어 컷 (마라도나·크림 사이트·젤리슈즈…)
    seen.add(key);
    out.push({ term, seed, rank: i + 1 });
  });
  return out;
}

/**
 * 여러 시드의 후보를 합쳐 **중복 제거**한다. 같은 완성어가 여러 시드에서 나오면
 * 가장 높은 순위(작은 rank)만 남긴다.
 */
export function mergeCandidates(lists: AcCandidate[][]): AcCandidate[] {
  const best = new Map<string, AcCandidate>();
  for (const c of lists.flat()) {
    const key = norm(c.term);
    const prev = best.get(key);
    if (!prev || c.rank < prev.rank) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

export interface AcResult {
  candidates: AcCandidate[];
  seeds: string[];
  count: number;
}

/** 브라우저용 클라이언트 — 내부 프록시(/api/naver-ac)를 호출한다. */
export async function fetchAutocomplete(seeds: string[]): Promise<AcResult> {
  const res = await fetch("/api/naver-ac", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? "자동완성 발굴에 실패했습니다.");
  }
  return json as AcResult;
}
