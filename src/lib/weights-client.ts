/** 신호 가중치(/api/signal-weights) 클라이언트. */
import { neutralWeights, type SignalWeights } from "./signal-weights";
import type { LabelSummary } from "./discovery-label";

export type { SignalWeights } from "./signal-weights";

/** 현재 캐시된 가중치. 실패 시 중립(발굴에 영향 없음). */
export async function fetchSignalWeights(): Promise<SignalWeights> {
  try {
    const res = await fetch("/api/signal-weights", { cache: "no-store" });
    if (!res.ok) return neutralWeights();
    return (await res.json()) as SignalWeights;
  } catch {
    return neutralWeights();
  }
}

interface RecomputeResponse {
  weights?: SignalWeights;
  summary?: LabelSummary;
  labeled?: number;
  demo?: boolean;
  note?: string;
  error?: string;
}

/**
 * 가중치 재학습.
 *  - 인자 없으면 **실제 로그**를 라벨링해 저장.
 *  - entries 를 주면 **데모**로 그것만 계산(저장 안 함).
 */
export async function recomputeSignalWeights(
  entries?: { term: string; firstSeenAt: string; source: string }[],
): Promise<RecomputeResponse> {
  const res = await fetch("/api/signal-weights", {
    method: "POST",
    ...(entries
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) }
      : {}),
  });
  return (await res.json()) as RecomputeResponse;
}
