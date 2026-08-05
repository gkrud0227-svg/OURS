/**
 * 발굴 재현율 백테스트 (아는 히트를 유튜브 발굴이 떠올렸나 · 언제).
 *
 * ── 지금까지의 검증과 무엇이 다른가 ────────────────────────────────
 *   • 검색 백테스트(backtest.ts)   = "판정" 검증. 검색 급상승 감지가 아는 히트를
 *                                    피크 전에 잡나. → 6/6, 중앙값 9주 선행.
 *   • predict-backtest.mjs          = "발굴" 정밀도. 발굴한 것 중 몇 %가 히트(앞으로).
 *                                    → 3% (넓은 그물이라 낮음).
 *   • 이 스크립트                    = "발굴" 재현율(뒤로). 아는 히트를 발굴이 애초에
 *                                    떠올렸나 + 검색 감지보다 이른가/늦은가.
 *
 * 방법: 각 히트의 **검색 감지 시점**(검색 백테스트의 signalPeriod)을 기준 시점 T 로
 *       삼아, 그 시점의 유튜브 발굴을 재현(asOf=T, T 이후 영상 미참조)하고,
 *       그 키워드가 후보 목록에 뜨는지 본다.
 *         • 뜸  → 발굴이 검색 감지 시점에 이미 그 단어를 알았다 (동시 이상).
 *         • 안 뜸 → 발굴이 검색보다 늦거나 놓쳤다 (= "발굴 지연"의 정량 증거).
 *
 * ── 한계 (검색 백테스트보다 덜 엄밀) ──────────────────────────────
 *   YouTube 과거 조회는 오늘까지 살아남은 영상을 오늘 인덱스로 재구성한다.
 *   → 생존/재색인 편향이 있어 "그때 실제로 봤을 것"의 근사치다. 방향성 참고용.
 *   또 시드에 안 걸린 영상은 못 뜬다(시드 커버리지 문제 ≠ 엔진 실패).
 *
 * 사용법:
 *   node scripts/discover-recall-backtest.mjs            # 검색 감지 시점(signal) 기준
 *   PHASE=peak node scripts/discover-recall-backtest.mjs # 피크 시점 기준(가장 관대)
 *   ASOF_OFFSET_WEEKS=-4 node ...                        # 기준 시점을 4주 앞당겨 더 엄격히
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MS_WEEK = 7 * 86_400_000;

/** 발굴 시드 — 국내 발굴 탭 기본값(채널·의도어 교차). 넓게 잡아 시드 커버리지를 확보. */
const SEEDS = (process.env.SEEDS ??
  "신상 디저트,유행 간식,편의점 신상,품절 대란 간식,요즘 유행 음료,신상 과자,해외 인기 간식,카페 신메뉴")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** 후보를 넓게 받아 재현율을 관대하게(라우트 상한 100). */
const TOP_N = 100;
/** 하루 쿼터(1만)를 넘지 않도록 누적 상한. */
const QUOTA_BUDGET = Number(process.env.QUOTA_BUDGET ?? 9000);
/** signal=검색 감지 시점, peak=피크 시점. */
const PHASE = process.env.PHASE === "peak" ? "peak" : "signal";
const OFFSET_WEEKS = Number(process.env.ASOF_OFFSET_WEEKS ?? 0);

/** 검색 백테스트가 저장한 곡선(감지/피크 시점 포함). */
const curvesPath = join(ROOT, "data", "backtest-curves.json");
let curves;
try {
  curves = JSON.parse(readFileSync(curvesPath, "utf8"));
} catch {
  console.error(`검색 백테스트 데이터가 없습니다: ${curvesPath}`);
  console.error("먼저 /api/backtest 를 돌려 data/backtest-curves.json 을 만들어 주세요.");
  process.exit(2);
}

/** 데이터랩에 없어 검색 기준 시점을 못 정하는 키워드는 수동 asOf 로 넣는다. */
const MANUAL = {
  // "봄동비빔밥": { asOf: "2024-03-01", peak: "2024-04-01" }, // 필요 시 채워서 사용
};

const targets = [];
for (const r of curves.results ?? []) {
  const asOfBase = PHASE === "peak" ? r.peakPeriod : r.signalPeriod;
  if (!asOfBase) continue;
  const asOfMs = Date.parse(asOfBase) + OFFSET_WEEKS * MS_WEEK;
  targets.push({
    kw: r.keyword,
    asOf: new Date(asOfMs).toISOString().slice(0, 10),
    signal: r.signalPeriod,
    peak: r.peakPeriod,
    caughtAtPctOfPeak: r.caughtAtPctOfPeak,
    searchLeadWeeks: r.leadWeeks,
  });
}
for (const [kw, m] of Object.entries(MANUAL)) {
  targets.push({ kw, asOf: PHASE === "peak" ? m.peak : m.asOf, signal: m.asOf, peak: m.peak, manual: true });
}

if (!targets.length) {
  console.error("대상 키워드가 없습니다.");
  process.exit(1);
}

const norm = (s) => (s ?? "").replace(/^#/, "").replace(/\s+/g, "").toLowerCase();

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${path} ${res.status}`);
  return json;
}

console.log(`발굴 재현율 백테스트 · 기준=${PHASE}${OFFSET_WEEKS ? ` (offset ${OFFSET_WEEKS}주)` : ""} · 시드 ${SEEDS.length}개`);
console.log(`대상 ${targets.length}개 · 쿼터 예산 ${QUOTA_BUDGET} units\n`);

let spent = 0;
const rows = [];
for (const t of targets) {
  if (spent >= QUOTA_BUDGET) {
    console.log(`⏸ 쿼터 예산(${QUOTA_BUDGET}) 도달 — ${t.kw} 이후 중단.`);
    rows.push({ ...t, status: "skipped-quota" });
    continue;
  }
  let disc;
  try {
    disc = await post("/api/global/discover", {
      seeds: SEEDS, region: "KR", asOf: t.asOf, topN: TOP_N,
      ...(process.env.RECENT_DAYS ? { recentDays: Number(process.env.RECENT_DAYS) } : {}),
    });
  } catch (e) {
    console.log(`✗ ${t.kw.padEnd(12)} 발굴 실패: ${e.message}`);
    rows.push({ ...t, status: "error", error: e.message });
    if (/쿼터|quota|403|429/i.test(e.message)) { console.log("→ 쿼터 소진으로 중단."); break; }
    continue;
  }
  spent += disc.quotaUnits ?? 0;

  const cands = (disc.candidates ?? []).map((c, i) => ({ ...c, rank: i + 1 }));
  const hit = cands.find((c) => norm(c.term) === norm(t.kw))
    ?? cands.find((c) => norm(c.term).includes(norm(t.kw)) || norm(t.kw).includes(norm(c.term)));

  const found = Boolean(hit);
  rows.push({
    ...t, status: "ok", found,
    lift: hit?.lift ?? null, rank: hit?.rank ?? null, novel: hit?.novel ?? null,
    candidateCount: cands.length, quotaUnits: disc.quotaUnits ?? 0,
    recentChannels: disc.counts?.recentChannels ?? null,
  });

  const mark = found ? "✓ 발굴됨" : "✗ 미발굴";
  const extra = found
    ? `lift ×${hit.lift} · #${hit.rank}${hit.novel ? " · 신조어" : ""}`
    : `후보 ${cands.length}개 중 없음`;
  console.log(`${mark}  ${t.kw.padEnd(12)} asOf ${t.asOf} (검색감지 ${t.signal} / 피크 ${t.peak}) · ${extra} · 쿼터 ${disc.quotaUnits} (누적 ${spent})`);
}

const ok = rows.filter((r) => r.status === "ok");
const foundN = ok.filter((r) => r.found).length;
console.log(`\n── 요약 ──────────────────────────────`);
console.log(`발굴 재현율: ${foundN}/${ok.length}  (기준 시점=${PHASE})`);
console.log(`  ✓ 발굴됨: ${ok.filter((r) => r.found).map((r) => r.kw).join(", ") || "—"}`);
console.log(`  ✗ 미발굴: ${ok.filter((r) => !r.found).map((r) => r.kw).join(", ") || "—"}`);
console.log(`총 쿼터 ${spent} units 사용`);
console.log(`\n해석: '발굴됨'은 검색 감지 시점에 유튜브 발굴도 그 단어를 이미 알았다는 뜻(동시 이상).`);
console.log(`      '미발굴'은 발굴이 검색보다 늦거나 시드에 안 걸렸다는 뜻(발굴 지연/커버리지).`);
console.log(`      ⚠ YouTube 과거 조회는 생존·재색인 편향이 있어 방향성 참고용입니다.`);

try {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const out = join(ROOT, "data", `discover-recall-${PHASE}.json`);
  writeFileSync(out, JSON.stringify({ phase: PHASE, seeds: SEEDS, generatedFor: targets.map((t) => t.kw), rows, summary: { found: foundN, total: ok.length, quota: spent } }, null, 2));
  console.log(`\n저장: ${out}`);
} catch (e) {
  console.log("결과 저장 실패:", e.message);
}
