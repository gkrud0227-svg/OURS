/** 이 건수 이상 함께 언급되면 "검증됨"(실제 소비자 인식 조합)으로 본다. */
export const MIN_CO_MENTION = 2;

export interface CoMention {
  term: string;
  /** 매칭에 실제로 쓰인 핵심어 (예: 떡갈비만들기 → 떡갈비) */
  core: string;
  /** 함께 언급된 문서 수 (YouTube + Instagram) */
  docs: number;
  /** YouTube 영상 텍스트에서 언급된 건수 */
  ytHits: number;
  /** Instagram 캡션에서 언급된 건수 */
  igHits: number;
  /** docs / docCount */
  rate: number;
}

export interface CoMentionResult {
  keyword: string;
  /** 분석한 전체 문서 수 (yt + ig) */
  docCount: number;
  ytCount: number;
  igCount: number;
  /** YouTube 수집 실패 사유 (있어도 Instagram 캡션으로 검증은 진행됨) */
  ytError?: string;
  results: CoMention[];
}

/**
 * 동반 후보들이 이 키워드의 실제 콘텐츠 텍스트(YouTube 제목·설명)에서
 * 몇 건이나 함께 언급되는지 검증한다.
 * → "검색 동반 상승(co-search)"과 "실제 인식 조합(co-mention)"을 구분하기 위함.
 */
export async function fetchCoMention(
  keyword: string,
  terms: string[],
): Promise<CoMentionResult> {
  const res = await fetch("/api/co-mention", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, terms }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error(
      (json as { error?: string })?.error ?? "동시언급 검증에 실패했습니다.",
    );
  }
  return json as CoMentionResult;
}
