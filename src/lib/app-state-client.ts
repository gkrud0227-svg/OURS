/** 범용 앱 상태(/api/app-state) 클라이언트 — 시드 등 영속화. */

export async function fetchState<T>(key: string): Promise<{ data: T | null; persisted: boolean }> {
  try {
    const res = await fetch(`/api/app-state?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    const json = (await res.json()) as { data?: T | null; persisted?: boolean };
    return { data: json.data ?? null, persisted: Boolean(json.persisted) };
  } catch {
    return { data: null, persisted: false };
  }
}

/** 실패는 조용히 무시(localStorage 가 폴백). */
export async function saveState(key: string, data: unknown): Promise<void> {
  try {
    await fetch("/api/app-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, data }),
    });
  } catch {
    /* 오프라인 등 — localStorage 가 유지 */
  }
}
