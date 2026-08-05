import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSupabaseAdmin } from "./supabase";

/**
 * 전향적 발굴 로그 저장소 — Supabase(영속) 또는 로컬 파일(폴백) 한 곳으로 통일.
 *
 * Supabase 키가 있으면 `discovery_log` 테이블에, 없으면 data/discovery-log.json 에 쓴다.
 * 어느 쪽이든 **최초 등장(firstSeenAt) dedup**(같은 term은 한 번만) 의미를 동일하게 유지한다.
 */

export interface LogEntry {
  term: string;
  source: string | null;
  firstSeenAt: string;
  novel: boolean;
  lift: number | null;
  dfRecent: number | null;
  contextTag: string | null;
  riseRate: number | null;
  volumeTotal: number | null;
  shopStatus: string | null;
  shopRise: number | null;
}

/** 로그에 넣을 후보(부분 입력) — term만 필수. */
export type LogCandidate = Partial<LogEntry> & { term?: string };

const TABLE = "discovery_log";

/* ---------- 로컬 파일 폴백 ---------- */

function filePath(): string {
  const candidates = [
    join(process.cwd(), "data", "discovery-log.json"),
    join(process.cwd(), "trend-dashboard", "data", "discovery-log.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* 다음 후보 */
    }
  }
  return candidates[0];
}

function readFileEntries(path: string): LogEntry[] {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { entries?: LogEntry[] };
    return raw.entries ?? [];
  } catch {
    return [];
  }
}

/* ---------- Supabase 행 매핑 ---------- */

interface Row {
  term: string;
  source: string | null;
  first_seen_at: string;
  novel: boolean;
  lift: number | null;
  df_recent: number | null;
  context_tag: string | null;
  rise_rate: number | null;
  volume_total: number | null;
  shop_status: string | null;
  shop_rise: number | null;
}

function rowToEntry(r: Row): LogEntry {
  return {
    term: r.term,
    source: r.source,
    firstSeenAt: r.first_seen_at,
    novel: r.novel,
    lift: r.lift,
    dfRecent: r.df_recent,
    contextTag: r.context_tag,
    riseRate: r.rise_rate,
    volumeTotal: r.volume_total,
    shopStatus: r.shop_status,
    shopRise: r.shop_rise,
  };
}

function entryToRow(e: LogEntry): Row {
  return {
    term: e.term,
    source: e.source,
    first_seen_at: e.firstSeenAt,
    novel: e.novel,
    lift: e.lift,
    df_recent: e.dfRecent,
    context_tag: e.contextTag,
    rise_rate: e.riseRate,
    volume_total: e.volumeTotal,
    shop_status: e.shopStatus,
    shop_rise: e.shopRise,
  };
}

function buildEntry(c: LogCandidate, at: string): LogEntry {
  return {
    term: (c.term ?? "").trim(),
    source: c.source ?? null,
    firstSeenAt: at,
    novel: Boolean(c.novel),
    lift: c.lift ?? null,
    dfRecent: c.dfRecent ?? null,
    contextTag: c.contextTag ?? null,
    riseRate: c.riseRate ?? null,
    volumeTotal: c.volumeTotal ?? null,
    shopStatus: c.shopStatus ?? null,
    shopRise: c.shopRise ?? null,
  };
}

/* ---------- 공개 API ---------- */

/** 전체 로그를 firstSeenAt 오름차순으로 읽는다. */
export async function readLog(): Promise<LogEntry[]> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .order("first_seen_at", { ascending: true });
    if (error) throw new Error(`Supabase 로그 읽기 실패: ${error.message}`);
    return (data as Row[] | null)?.map(rowToEntry) ?? [];
  }
  return readFileEntries(filePath());
}

/**
 * 최초 등장 후보만 append한다(이미 있는 term은 건너뜀).
 * @returns 실제로 추가된 수와 전체 수
 */
export async function appendLog(
  candidates: LogCandidate[],
  at: string,
): Promise<{ added: number; total: number }> {
  const existing = await readLog();
  const seen = new Set(existing.map((e) => e.term));

  const toAdd: LogEntry[] = [];
  for (const c of candidates) {
    const term = (c.term ?? "").trim();
    if (!term || seen.has(term)) continue; // 최초 등장이 아니면 스킵
    seen.add(term);
    toAdd.push(buildEntry({ ...c, term }, at));
  }

  if (toAdd.length) {
    const sb = getSupabaseAdmin();
    if (sb) {
      // 사전 필터에 더해, 경합(race) 시 중복 term은 무시(onConflict).
      const { error } = await sb
        .from(TABLE)
        .upsert(toAdd.map(entryToRow), { onConflict: "term", ignoreDuplicates: true });
      if (error) throw new Error(`Supabase 로그 저장 실패: ${error.message}`);
    } else {
      const path = filePath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ entries: [...existing, ...toAdd] }, null, 2));
    }
  }

  return { added: toAdd.length, total: existing.length + toAdd.length };
}
