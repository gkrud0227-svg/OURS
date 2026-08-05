/**
 * 전향적 발굴 로그 클라이언트 — 발굴 결과를 서버 로그(/api/discovery-log)에 흘려보낸다.
 * 실패해도 발굴 자체엔 영향 없다(fire-and-forget). 최초 등장 후보만 서버가 append 한다.
 */
export interface DiscoveryLogInput {
  term: string;
  source?: string;
  novel?: boolean;
  lift?: number;
  dfRecent?: number;
  contextTag?: string;
  riseRate?: number | null;
  volumeTotal?: number;
  shopStatus?: string;
  shopRise?: number | null;
}

export async function logDiscovery(candidates: DiscoveryLogInput[]): Promise<void> {
  if (!candidates.length) return;
  try {
    await fetch("/api/discovery-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: new Date().toISOString(), candidates }),
    });
  } catch {
    // 전향적 로깅은 보조 기능 — 실패해도 발굴/검증엔 영향 없다.
  }
}
