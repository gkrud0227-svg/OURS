export type InstagramLocalMode = "keyword" | "hashtag";

export interface InstagramLocalSummary {
  itemCount?: number;
  withLikes?: number;
  withComments?: number;
  withViews?: number;
  keywordMatched?: number;
  pageKeywordMatched?: number;
  avgLikes?: number | null;
  avgComments?: number | null;
  avgViews?: number | null;
  reelShare?: number | null;
  topScreenCount?: number;
}

export interface InstagramLocalRun {
  id: string;
  status: "running" | "completed" | "failed" | string;
  mode: InstagramLocalMode | "current" | string;
  terms: string[];
  label?: string;
  collectionMode?: string;
  startedAt: string;
  endedAt?: string | null;
  summary?: InstagramLocalSummary & { error?: string };
}

export interface InstagramLocalItem {
  id?: string;
  runId?: string;
  collectionMode?: string;
  sourceMode?: InstagramLocalMode | "current" | string;
  sourceTerm?: string;
  searchedAt?: string;
  observedRank?: number;
  rankBucket?: "top_screen" | "extended" | string;
  scrollStep?: number;
  screenOrder?: number;
  pageKeywordMatched?: boolean;
  keywordMatched?: boolean;
  matchedTerms?: string[];
  collectionRule?: string;
  url: string;
  type?: "post" | "reel" | "video" | string;
  likeCount?: number | null;
  commentCount?: number | null;
  viewCount?: number | null;
  publishedAt?: string;
  caption?: string;
  previewText?: string;
  rawTextSnapshot?: string;
  sourcePageUrl?: string;
  thumbnail?: string;
  collectedAt?: string;
  error?: string;
}

export interface InstagramLocalTrendPoint extends InstagramLocalSummary {
  runId: string;
  startedAt: string;
  status: string;
}

export interface InstagramLocalRankChange {
  url: string;
  sourceTerm: string;
  type?: string;
  observedRank?: number;
  previousRank?: number | null;
  rankDelta?: number | null;
  direction: "new" | "up" | "down" | "same" | string;
  viewCount?: number | null;
  commentCount?: number | null;
  likeCount?: number | null;
  caption?: string;
}

export interface InstagramLocalTrendGroup {
  key: string;
  sourceMode: string;
  sourceTerm: string;
  currentRunId: string;
  previousRunId: string | null;
  currentSummary: InstagramLocalSummary;
  previousSummary: InstagramLocalSummary;
  deltas: {
    avgViews?: number | null;
    avgComments?: number | null;
    avgLikes?: number | null;
    reelShare?: number | null;
  };
  newEntryCount: number;
  repeatedEntryCount: number;
  history: InstagramLocalTrendPoint[];
  rankChanges: InstagramLocalRankChange[];
}

export interface InstagramLocalTrend {
  run: InstagramLocalRun;
  groups: InstagramLocalTrendGroup[];
}

export interface InstagramLocalPaths {
  appDataDir: string;
  browserProfileDir: string;
  dataDir: string;
  exportDir: string;
  dbPath: string;
}

export interface InstagramLocalCollectOptions {
  mode: InstagramLocalMode;
  terms: string[];
  maxPostsPerTerm: number;
  scrollSteps: number;
  delayMs: number;
  collectDetails: boolean;
  requireKeywordMatch: boolean;
  requirePageMatch: boolean;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | T | null;
  if (!res.ok) {
    throw new Error((json as { error?: string } | null)?.error ?? "요청에 실패했습니다.");
  }
  return json as T;
}

export function getInstagramLocalPaths() {
  return jsonRequest<InstagramLocalPaths>("/api/instagram-local/paths");
}

export function openInstagramLocalBrowser() {
  return jsonRequest<{ browser: { profileDir: string; url: string }; progress: unknown[] }>(
    "/api/instagram-local/browser/open",
    { method: "POST", body: "{}" },
  );
}

export function closeInstagramLocalBrowser() {
  return jsonRequest<{ ok: true }>("/api/instagram-local/browser/close", {
    method: "POST",
    body: "{}",
  });
}

export function collectInstagramLocal(options: InstagramLocalCollectOptions) {
  return jsonRequest<{
    run: InstagramLocalRun;
    items: InstagramLocalItem[];
    summary: InstagramLocalSummary;
    progress: Array<{ level?: string; message?: string }>;
  }>("/api/instagram-local/collect", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function listInstagramLocalRuns() {
  return jsonRequest<{ runs: InstagramLocalRun[] }>("/api/instagram-local/runs");
}

export function listInstagramLocalItems(runId?: string, limit = 500) {
  const params = new URLSearchParams();
  if (runId) params.set("runId", runId);
  params.set("limit", String(limit));
  return jsonRequest<{ items: InstagramLocalItem[] }>(
    `/api/instagram-local/items?${params}`,
  );
}

export function getInstagramLocalTrend(runId: string) {
  const params = new URLSearchParams({ runId });
  return jsonRequest<{ trend: InstagramLocalTrend | null }>(
    `/api/instagram-local/trend?${params}`,
  );
}

export function exportInstagramLocalCsv(runId: string) {
  return jsonRequest<{ exportPath: string }>("/api/instagram-local/export", {
    method: "POST",
    body: JSON.stringify({ runId }),
  });
}
