import type { InstagramStat, YouTubeStat } from "./types";

async function postStats<T>(
  url: string,
  keywords: string[],
  fallbackError: string,
): Promise<Record<string, T>> {
  const res = await fetch(url, {
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
    throw new Error((json as { error?: string })?.error ?? fallbackError);
  }
  return ((json as { stats?: Record<string, T> }).stats ?? {}) as Record<string, T>;
}

export function fetchYouTube(
  keywords: string[],
): Promise<Record<string, YouTubeStat>> {
  return postStats<YouTubeStat>("/api/youtube", keywords, "YouTube 요청에 실패했습니다.");
}

export function fetchInstagram(
  keywords: string[],
): Promise<Record<string, InstagramStat>> {
  return postStats<InstagramStat>(
    "/api/instagram",
    keywords,
    "Instagram 요청에 실패했습니다.",
  );
}
