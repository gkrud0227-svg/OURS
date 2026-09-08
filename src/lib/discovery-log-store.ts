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
  /**
   * 라벨 판정 결과. null 이면 아직 판정 안 한 후보다.
   * ⚠️ "pending" 은 판정을 **시도했으나 관측 창(4주)이 안 지난** 것이라 null 과 다르다.
   *    둘을 섞으면 "판정할 게 남았는가"를 물을 수 없다.
   */
  label: "hit" | "dud" | "pending" | null;
  labeledAt: string | null;
  observedWeeks: number | null;
  peakRise: number | null;
  labelReason: string | null;
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
  label?: string | null;
  labeled_at?: string | null;
  observed_weeks?: number | null;
  peak_rise?: number | null;
  label_reason?: string | null;
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
    label: (r.label as LogEntry["label"]) ?? null,
    labeledAt: r.labeled_at ?? null,
    observedWeeks: r.observed_weeks ?? null,
    peakRise: r.peak_rise ?? null,
    labelReason: r.label_reason ?? null,
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
    // 라벨은 여기서 쓰지 않는다 — append 는 "처음 봤다"만 기록하고,
    // 판정은 나중에 writeLabels 가 따로 눌러 담는다.
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
    label: null,
    labeledAt: null,
    observedWeeks: null,
    peakRise: null,
    labelReason: null,
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

/** 라벨 판정 결과 한 건 — 로그에 눌러 담을 최소 형태. */
export interface LabelPatch {
  term: string;
  label: "hit" | "dud" | "pending";
  observedWeeks: number | null;
  peakRise: number | null;
  reason: string | null;
}

/**
 * 판정 결과를 로그에 기록한다(term 기준 갱신).
 *
 * ⚠️ upsert 를 쓰지 않는다 — upsert 는 없는 term 이면 새 행을 만드는데, 여기 오는 term 은
 *    이미 로그에 있는 것뿐이라 새로 생기면 first_seen_at 없는 깨진 행이 된다. update 로 건다.
 * ⚠️ 로컬 파일 폴백에서는 전체를 다시 쓴다(파일이 통짜라 부분 갱신이 없다).
 */
export async function writeLabels(patches: LabelPatch[], at: string): Promise<number> {
  if (!patches.length) return 0;
  const sb = getSupabaseAdmin();
  if (sb) {
    let n = 0;
    // 행마다 값이 달라 한 번에 못 묶는다. 건수가 수백이라 순차로 충분하다.
    for (const p of patches) {
      const { error } = await sb
        .from(TABLE)
        .update({
          label: p.label,
          labeled_at: at,
          observed_weeks: p.observedWeeks,
          peak_rise: p.peakRise,
          label_reason: p.reason,
        })
        .eq("term", p.term);
      if (error) throw new Error(`Supabase 라벨 저장 실패: ${error.message}`);
      n += 1;
    }
    return n;
  }
  const path = filePath();
  const entries = readFileEntries(path);
  const byTerm = new Map(patches.map((p) => [p.term, p]));
  let n = 0;
  for (const e of entries) {
    const p = byTerm.get(e.term);
    if (!p) continue;
    e.label = p.label;
    e.labeledAt = at;
    e.observedWeeks = p.observedWeeks;
    e.peakRise = p.peakRise;
    e.labelReason = p.reason;
    n += 1;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ entries }, null, 2));
  return n;
}
