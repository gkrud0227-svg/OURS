/**
 * 발굴 결과에서 "제품 후보"와 무관한 키워드를 걸러내는 노이즈 필터.
 * 검색광고 keywordstool은 광고 연관 키워드를 넓게 반환하므로,
 * 장소·여행·행사·맛집·명절·건강증상·상거래 의도 키워드를 제외한다.
 *
 * 필요에 맞게 아래 목록을 자유롭게 추가/삭제하세요.
 */

// 키워드에 이 문자열이 포함되면 제외
const NOISE_SUBSTRINGS: string[] = [
  // 장소·여행·행사
  "가볼만한곳", "여행", "관광", "명소", "가는법", "가는길", "나들이", "데이트",
  "축제", "전시회", "박람회", "공연", "페스티벌", "숙소", "펜션", "호텔",
  // 명절·시즌 이벤트
  "추석", "설날", "명절", "차례", "제사", "선물세트",
  // 건강·증상 의도
  "당뇨", "혈당", "효능", "부작용", "에좋은", "다이어트식단",
  // 상거래·비즈니스 의도
  "도매", "납품", "프랜차이즈", "창업", "알바", "채용", "학원", "자격증",
];

// 키워드가 이 문자열로 끝나면 제외 (장소성) — 현재 없음
const NOISE_SUFFIXES: string[] = [];

export function isNoiseKeyword(keyword: string): boolean {
  const k = keyword.replace(/\s+/g, "");
  if (!k) return true;
  if (NOISE_SUFFIXES.some((s) => k.endsWith(s))) return true;
  return NOISE_SUBSTRINGS.some((s) => k.includes(s));
}

export function filterNoise<T extends { name: string }>(items: T[]): T[] {
  return items.filter((it) => !isNoiseKeyword(it.name));
}
