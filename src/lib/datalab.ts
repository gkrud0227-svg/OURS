export interface DataLabResult {
  title: string;
  data: { period: string; ratio: number }[];
}

/**
 * 서버 프록시(/api/datalab)를 통해 네이버 데이터랩 검색어 트렌드를 조회한다.
 * 클라이언트 시크릿은 서버에서만 사용되며 브라우저에 노출되지 않는다.
 */
export async function fetchDataLab(
  keywords: string[],
): Promise<DataLabResult[]> {
  const res = await fetch("/api/datalab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }

  if (!res.ok) {
    const message =
      (json as { error?: string })?.error ?? "데이터랩 요청에 실패했습니다.";
    throw new Error(message);
  }

  return ((json as { results?: DataLabResult[] }).results ?? []).map((r) => ({
    title: r.title,
    data: (r.data ?? []).map((d) => ({ period: d.period, ratio: d.ratio })),
  }));
}
