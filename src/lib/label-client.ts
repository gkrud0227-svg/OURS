/** 발굴 라벨링(/api/discovery-label) 클라이언트. 타입은 서버 순수 로직에서 재사용. */
import type { LabelResult, LabelSummary } from "./discovery-label";

export type { LabelResult, LabelSummary, BucketStat } from "./discovery-label";

export interface LabelResponse {
  results: LabelResult[];
  summary: LabelSummary;
  window?: number;
  note?: string;
  error?: string;
}

/** 실제 전향적 로그를 라벨링. */
export async function fetchLogLabels(): Promise<LabelResponse> {
  const res = await fetch("/api/discovery-label", { cache: "no-store" });
  const json = (await res.json()) as LabelResponse;
  if (!res.ok) return { results: [], summary: emptySummary(), error: json.error };
  return json;
}

/** 데모: 임의의 키워드/발견일을 라벨링(실제 로그 미변경). */
export async function fetchDemoLabels(
  entries: { term: string; firstSeenAt: string }[],
): Promise<LabelResponse> {
  const res = await fetch("/api/discovery-label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const json = (await res.json()) as LabelResponse;
  if (!res.ok) return { results: [], summary: emptySummary(), error: json.error };
  return json;
}

function emptySummary(): LabelSummary {
  return {
    total: 0,
    matured: 0,
    pending: 0,
    hit: 0,
    dud: 0,
    fdr: null,
    precision: null,
    bySource: [],
    byNovel: [],
  };
}
