const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const SCHEMA_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function safeFilePart(value) {
  return String(value || "run")
    .replace(/[^a-z0-9가-힣_-]+/gi, "_")
    .slice(0, 80);
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function normalizeData(data) {
  return {
    schemaVersion: data && data.schemaVersion ? data.schemaVersion : SCHEMA_VERSION,
    runs: data && Array.isArray(data.runs) ? data.runs : [],
    items: data && Array.isArray(data.items) ? data.items : []
  };
}

function sortItemsForRun(items) {
  return [...items].sort((a, b) => {
    const aRank = Number.isFinite(a.observedRank) ? a.observedRank : Number.MAX_SAFE_INTEGER;
    const bRank = Number.isFinite(b.observedRank) ? b.observedRank : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return String(a.url || "").localeCompare(String(b.url || ""));
  });
}

function runTime(run) {
  const value = new Date(run.startedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function sourceKey(item) {
  return `${item.sourceMode || ""}|${item.sourceTerm || ""}`;
}

function summarizeGroup(items) {
  const itemCount = items.length;
  const reelCount = items.filter((item) => item.type === "reel").length;
  return {
    itemCount,
    withLikes: items.filter((item) => Number.isFinite(item.likeCount)).length,
    withComments: items.filter((item) => Number.isFinite(item.commentCount)).length,
    withViews: items.filter((item) => Number.isFinite(item.viewCount)).length,
    avgLikes: average(items.map((item) => item.likeCount)),
    avgComments: average(items.map((item) => item.commentCount)),
    avgViews: average(items.map((item) => item.viewCount)),
    reelShare: itemCount ? Math.round((reelCount / itemCount) * 100) : null,
    topScreenCount: items.filter((item) => item.rankBucket === "top_screen").length
  };
}

class LocalStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.dataDir = path.join(/*turbopackIgnore: true*/ baseDir, "data");
    this.exportDir = path.join(/*turbopackIgnore: true*/ baseDir, "exports");
    this.dbPath = path.join(this.dataDir, "collections.json");
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.exportDir, { recursive: true });
    try {
      await fs.access(this.dbPath);
    } catch {
      await this.write({ schemaVersion: SCHEMA_VERSION, runs: [], items: [] });
    }
  }

  async read() {
    await this.init();
    const raw = await fs.readFile(this.dbPath, "utf8");
    return normalizeData(JSON.parse(raw));
  }

  async write(data) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const tempPath = `${this.dbPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(normalizeData(data), null, 2), "utf8");
    await fs.rename(tempPath, this.dbPath);
  }

  async createRun(input) {
    const data = await this.read();
    const run = {
      id: crypto.randomUUID(),
      status: "running",
      mode: input.mode,
      terms: input.terms || [],
      label: input.label || "",
      collectionMode: input.collectionMode || (input.mode === "current" ? "safe" : "assisted"),
      options: input,
      startedAt: nowIso(),
      endedAt: null,
      summary: {}
    };
    data.runs.unshift(run);
    await this.write(data);
    return run;
  }

  async finishRun(runId, patch) {
    const data = await this.read();
    const run = data.runs.find((entry) => entry.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    Object.assign(run, patch, { endedAt: nowIso() });
    await this.write(data);
    return run;
  }

  async appendItems(runId, items) {
    const data = await this.read();
    const createdAt = nowIso();
    const existingKeys = new Set(data.items.map((item) => `${item.runId}|${item.url}`));
    for (const item of items) {
      const key = `${runId}|${item.url}`;
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);
      data.items.push({
        id: crypto.randomUUID(),
        runId,
        collectedAt: createdAt,
        ...item
      });
    }
    await this.write(data);
  }

  async listRuns() {
    const data = await this.read();
    return data.runs;
  }

  async listItems({ runId, limit = 500 } = {}) {
    const data = await this.read();
    let items = data.items;
    if (runId) {
      items = items.filter((item) => item.runId === runId);
      return sortItemsForRun(items).slice(0, limit);
    }
    return items.slice(-limit).reverse();
  }

  async clearAll() {
    await this.write({ schemaVersion: SCHEMA_VERSION, runs: [], items: [] });
  }

  async getTrendForRun(runId) {
    const data = await this.read();
    const run = data.runs.find((entry) => entry.id === runId);
    if (!run) {
      return null;
    }

    const currentItems = sortItemsForRun(data.items.filter((item) => item.runId === runId));
    const grouped = new Map();
    for (const item of currentItems) {
      const key = sourceKey(item);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(item);
    }

    const groups = [];
    for (const [key, items] of grouped) {
      const [sourceMode, sourceTerm] = key.split("|");
      const matchingRunIds = new Set(
        data.items
          .filter((item) => item.sourceMode === sourceMode && item.sourceTerm === sourceTerm)
          .map((item) => item.runId)
      );
      const matchingRuns = data.runs
        .filter((entry) => matchingRunIds.has(entry.id))
        .sort((a, b) => runTime(a) - runTime(b));
      const currentIndex = matchingRuns.findIndex((entry) => entry.id === run.id);
      const previousRun = currentIndex > 0 ? matchingRuns[currentIndex - 1] : null;
      const previousItems = previousRun
        ? sortItemsForRun(data.items.filter((item) => item.runId === previousRun.id && item.sourceMode === sourceMode && item.sourceTerm === sourceTerm))
        : [];
      const previousUrlToRank = new Map(previousItems.map((item) => [item.url, item.observedRank]));
      const previousUrls = new Set(previousItems.map((item) => item.url));
      const currentUrls = new Set(items.map((item) => item.url));
      const currentSummary = summarizeGroup(items);
      const previousSummary = summarizeGroup(previousItems);

      const history = matchingRuns.slice(-12).map((entry) => {
        const runItems = data.items.filter((item) => item.runId === entry.id && item.sourceMode === sourceMode && item.sourceTerm === sourceTerm);
        return {
          runId: entry.id,
          startedAt: entry.startedAt,
          status: entry.status,
          ...summarizeGroup(runItems)
        };
      });

      const rankChanges = items.slice(0, 30).map((item) => {
        const previousRank = previousUrlToRank.get(item.url);
        let direction = "new";
        let rankDelta = null;
        if (Number.isFinite(previousRank)) {
          rankDelta = previousRank - item.observedRank;
          direction = rankDelta > 0 ? "up" : rankDelta < 0 ? "down" : "same";
        }
        return {
          url: item.url,
          sourceTerm,
          type: item.type,
          observedRank: item.observedRank,
          previousRank: numberOrNull(previousRank),
          rankDelta,
          direction,
          viewCount: numberOrNull(item.viewCount),
          commentCount: numberOrNull(item.commentCount),
          likeCount: numberOrNull(item.likeCount),
          caption: item.caption || item.previewText || ""
        };
      });

      groups.push({
        key,
        sourceMode,
        sourceTerm,
        currentRunId: run.id,
        previousRunId: previousRun ? previousRun.id : null,
        currentSummary,
        previousSummary,
        deltas: {
          avgViews: Number.isFinite(currentSummary.avgViews) && Number.isFinite(previousSummary.avgViews)
            ? currentSummary.avgViews - previousSummary.avgViews
            : null,
          avgComments: Number.isFinite(currentSummary.avgComments) && Number.isFinite(previousSummary.avgComments)
            ? currentSummary.avgComments - previousSummary.avgComments
            : null,
          avgLikes: Number.isFinite(currentSummary.avgLikes) && Number.isFinite(previousSummary.avgLikes)
            ? currentSummary.avgLikes - previousSummary.avgLikes
            : null,
          reelShare: Number.isFinite(currentSummary.reelShare) && Number.isFinite(previousSummary.reelShare)
            ? currentSummary.reelShare - previousSummary.reelShare
            : null
        },
        newEntryCount: [...currentUrls].filter((url) => !previousUrls.has(url)).length,
        repeatedEntryCount: [...currentUrls].filter((url) => previousUrls.has(url)).length,
        history,
        rankChanges
      });
    }

    return {
      run,
      groups
    };
  }

  async exportCsv(runId) {
    const data = await this.read();
    const run = data.runs.find((entry) => entry.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const items = data.items.filter((item) => item.runId === runId);
    const headers = [
      "runId",
      "collectionMode",
      "sourceMode",
      "sourceTerm",
      "searchedAt",
      "observedRank",
      "rankBucket",
      "scrollStep",
      "screenOrder",
      "pageKeywordMatched",
      "keywordMatched",
      "matchedTerms",
      "collectionRule",
      "url",
      "type",
      "likeCount",
      "commentCount",
      "viewCount",
      "publishedAt",
      "caption",
      "previewText",
      "rawTextSnapshot",
      "sourcePageUrl",
      "thumbnail",
      "collectedAt"
    ];
    const rows = [
      headers.join(","),
      ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(","))
    ];

    const firstTerm = Array.isArray(run.terms) && run.terms.length ? run.terms[0] : run.label || run.mode;
    const fileName = `${safeFilePart(run.mode)}_${safeFilePart(firstTerm)}_${run.startedAt.replace(/[:.]/g, "-")}.csv`;
    const exportPath = path.join(this.exportDir, fileName);
    await fs.writeFile(exportPath, rows.join("\r\n"), "utf8");
    return exportPath;
  }

  getPaths() {
    return {
      dataDir: this.dataDir,
      exportDir: this.exportDir,
      dbPath: this.dbPath
    };
  }
}

module.exports = {
  LocalStore
};
