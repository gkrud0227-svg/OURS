/** 저장한 후보(watchlist) 클라이언트 — /api/watchlist. */
import type { Keyword } from "./types";

/**
 * 서버에서 watchlist 를 읽는다.
 * @returns persisted=true 면 서버 값(keywords) 사용, false 면 localStorage 로 폴백.
 */
export async function fetchWatchlist(): Promise<{ keywords: Keyword[] | null; persisted: boolean }> {
  try {
    const res = await fetch("/api/watchlist", { cache: "no-store" });
    const json = (await res.json()) as { keywords?: Keyword[] | null; persisted?: boolean };
    return { keywords: json.keywords ?? null, persisted: Boolean(json.persisted) };
  } catch {
    return { keywords: null, persisted: false };
  }
}

/** watchlist 전체를 서버에 저장(교체). 실패는 조용히 무시(localStorage 가 폴백). */
export async function saveWatchlist(keywords: Keyword[]): Promise<void> {
  try {
    await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords }),
    });
  } catch {
    /* 오프라인 등 — localStorage 가 유지하므로 무시 */
  }
}
