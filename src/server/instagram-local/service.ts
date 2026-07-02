import path from "node:path";

import { InstagramCollector } from "./instagramCollector";
import { LocalStore } from "./store";

export type InstagramLocalMode = "keyword" | "hashtag";

export interface InstagramLocalCollectOptions {
  mode?: InstagramLocalMode;
  terms?: string[];
  label?: string;
  maxPostsPerTerm?: number;
  scrollSteps?: number;
  delayMs?: number;
  collectDetails?: boolean;
  requireKeywordMatch?: boolean;
  requirePageMatch?: boolean;
}

type ProgressMessage = {
  level?: "info" | "warn" | "error";
  message?: string;
};

type InstagramItem = {
  type?: string;
  sourceMode?: string;
  sourceTerm?: string;
  rankBucket?: string;
  keywordMatched?: boolean;
  pageKeywordMatched?: boolean;
  viewCount?: number | null;
  commentCount?: number | null;
  likeCount?: number | null;
};

type SummaryTerm = {
  sourceMode?: string;
  sourceTerm?: string;
  itemCount: number;
  avgViews: number | null;
  avgComments: number | null;
  avgLikes: number | null;
};

export type InstagramLocalSummary = {
  itemCount: number;
  withLikes: number;
  withComments: number;
  withViews: number;
  keywordMatched: number;
  pageKeywordMatched: number;
  avgLikes: number | null;
  avgComments: number | null;
  avgViews: number | null;
  reelShare: number | null;
  topScreenCount: number;
  byTerm: Record<string, SummaryTerm>;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.round(n), max));
}

function average(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function normalizeCollectOptions(input: InstagramLocalCollectOptions) {
  const mode: InstagramLocalMode = input.mode === "hashtag" ? "hashtag" : "keyword";
  const terms = Array.isArray(input.terms)
    ? input.terms.map((term) => String(term).trim()).filter(Boolean)
    : [];

  return {
    mode,
    terms,
    label: input.label || "",
    collectionMode: "assisted",
    maxPostsPerTerm: clampNumber(input.maxPostsPerTerm, 15, 1, 30),
    scrollSteps: clampNumber(input.scrollSteps, 1, 0, 2),
    delayMs: clampNumber(input.delayMs, 2200, 1200, 10000),
    collectDetails: input.collectDetails !== false,
    requireKeywordMatch: Boolean(input.requireKeywordMatch),
    requirePageMatch: input.requirePageMatch !== false,
  };
}

function summarizeItems(items: InstagramItem[]): InstagramLocalSummary {
  const itemCount = items.length;
  const reelCount = items.filter((item) => item.type === "reel").length;
  const byTerm: Record<string, SummaryTerm> = {};

  for (const item of items) {
    const key = `${item.sourceMode || "unknown"}:${item.sourceTerm || "unknown"}`;
    byTerm[key] ??= {
      sourceMode: item.sourceMode,
      sourceTerm: item.sourceTerm,
      itemCount: 0,
      avgViews: null,
      avgComments: null,
      avgLikes: null,
    };
    byTerm[key].itemCount += 1;
  }

  for (const entry of Object.values(byTerm)) {
    const termItems = items.filter(
      (item) =>
        item.sourceMode === entry.sourceMode && item.sourceTerm === entry.sourceTerm,
    );
    entry.avgViews = average(termItems.map((item) => item.viewCount));
    entry.avgComments = average(termItems.map((item) => item.commentCount));
    entry.avgLikes = average(termItems.map((item) => item.likeCount));
  }

  return {
    itemCount,
    withLikes: items.filter((item) => Number.isFinite(item.likeCount)).length,
    withComments: items.filter((item) => Number.isFinite(item.commentCount)).length,
    withViews: items.filter((item) => Number.isFinite(item.viewCount)).length,
    keywordMatched: items.filter((item) => item.keywordMatched).length,
    pageKeywordMatched: items.filter((item) => item.pageKeywordMatched).length,
    avgLikes: average(items.map((item) => item.likeCount)),
    avgComments: average(items.map((item) => item.commentCount)),
    avgViews: average(items.map((item) => item.viewCount)),
    reelShare: itemCount ? Math.round((reelCount / itemCount) * 100) : null,
    topScreenCount: items.filter((item) => item.rankBucket === "top_screen").length,
    byTerm,
  };
}

export class InstagramLocalService {
  readonly baseDir: string;
  readonly profileDir: string;

  private store: LocalStore;
  private collector: InstagramCollector;
  private initialized = false;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.profileDir = path.join(
      /*turbopackIgnore: true*/ baseDir,
      "instagram-browser-profile",
    );
    this.store = new LocalStore(baseDir);
    this.collector = new InstagramCollector({ profileDir: this.profileDir });
  }

  async init() {
    if (this.initialized) return;
    await this.store.init();
    this.initialized = true;
  }

  async getPaths() {
    await this.init();
    return {
      appDataDir: this.baseDir,
      browserProfileDir: this.profileDir,
      ...this.store.getPaths(),
    };
  }

  async openBrowser(progress: (message: ProgressMessage) => void = () => {}) {
    await this.init();
    return this.collector.openBrowser(progress as unknown as () => void);
  }

  async closeBrowser() {
    await this.init();
    await this.collector.closeBrowser();
    return { ok: true };
  }

  async collect(input: InstagramLocalCollectOptions) {
    await this.init();
    const options = normalizeCollectOptions(input);
    if (!options.terms.length) {
      throw new Error("수집할 키워드 또는 해시태그를 입력하세요.");
    }

    const progress: ProgressMessage[] = [];
    const run = await this.store.createRun(options);

    try {
      const items = await this.collector.collect(
        options,
        ((message: ProgressMessage) => {
          progress.push(message);
        }) as unknown as () => void,
      );
      await this.store.appendItems(run.id, items);
      const summary = summarizeItems(items);
      const finished = await this.store.finishRun(run.id, {
        status: "completed",
        summary,
      });
      return { run: finished, items, summary, progress };
    } catch (error) {
      await this.store.finishRun(run.id, {
        status: "failed",
        summary: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async listRuns() {
    await this.init();
    return this.store.listRuns();
  }

  async listItems(query: { runId?: string; limit?: number }) {
    await this.init();
    return this.store.listItems(query);
  }

  async getTrendForRun(runId: string) {
    await this.init();
    return this.store.getTrendForRun(runId);
  }

  async clearAll() {
    await this.init();
    await this.store.clearAll();
    return { ok: true };
  }

  async exportCsv(runId: string) {
    await this.init();
    const exportPath = await this.store.exportCsv(runId);
    return { exportPath };
  }
}

declare global {
  var __instagramLocalService: InstagramLocalService | undefined;
}

export function getInstagramLocalService() {
  if (!globalThis.__instagramLocalService) {
    const defaultBaseDir = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      ".local",
      "instagram-analyzer",
    );
    const baseDir = path.resolve(process.env.INSTAGRAM_LOCAL_DATA_DIR ?? defaultBaseDir);
    globalThis.__instagramLocalService = new InstagramLocalService(baseDir);
  }

  return globalThis.__instagramLocalService;
}
