export interface RawCandidate {
  name: string;
  volumePc: number;
  volumeMobile: number;
  volumeTotal: number;
  compIdx?: string;
}

/**
 * 네이버 검색광고 keywordstool 프록시(/api/searchad)로 시드에서 연관 키워드 +
 * 월간 검색량을 발굴한다. 검색량 내림차순으로 정렬되어 온다.
 */
export async function fetchCandidates(
  seeds: string[],
): Promise<RawCandidate[]> {
  const res = await fetch("/api/searchad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? "발굴 요청에 실패했습니다.");
  }
  return (json as { candidates?: RawCandidate[] }).candidates ?? [];
}
