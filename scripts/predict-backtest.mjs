/**
 * 발굴 파이프라인 예측력 백테스트 (out-of-sample).
 *
 * 기존 /backtest 는 "이미 히트한 키워드"에 급상승 로직을 되감아 적용한다.
 * 히트한 것만 보므로 생존 편향이 있고, "얼마나 일찍 잡나(재현율)"만 답한다.
 *
 * 이 스크립트는 순서를 뒤집는다 —
 *   ① 과거 기준 시점 T 에서 국내 발굴을 그대로 재현한다 (T 이후 영상은 보지 않는다).
 *   ② 그때 나온 후보를 네이버 데이터랩으로 이중 확인한다 (T 까지의 검색 데이터만).
 *   ③ T 이후 실제 검색 곡선으로 채점한다.
 *
 * 그래서 "발굴한 것 중 몇 %가 실제로 떴나(정밀도)"에 답할 수 있고,
 * 이중 확인이 실제로 걸러주는지(콘텐츠만 vs 콘텐츠+검색)를 비교할 수 있다.
 *
 * ── 알려진 한계 ────────────────────────────────────────────────
 * 채점은 "T 이후 검색이 터졌나"만 본다. 그래서 **계절성 반복**(김장철 김치처럼
 * 해마다 오르는 상용어)도 히트로 잡힌다. 실측에서 "김치"는 ×4.2 로 히트 판정됐다.
 * 조회 구간을 2년으로 늘려도 마찬가지였다.
 * 다만 후보는 신조어 위주로 걸러진 발굴 결과라 상용어가 올라오는 경우 자체가 드물다.
 * 요약에서 **신규 등장 / 기존어 상승**을 나눠 보여주니 이 오탐은 후자에 몰린다.
 *
 *   node scripts/predict-backtest.mjs 2024-04-01
 *   node scripts/predict-backtest.mjs 2024-04-01 "신상 디저트,유행 간식"
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MS_DAY = 86_400_000;

/** T 이후 이 기간 안에 뜨면 "적중"으로 본다. */
const HORIZON_WEEKS = 26;
/** 채점 기준 — T 직전 대비 이 배수 이상 올라야 히트. */
const HIT_MULTIPLE = 3;
/**
 * 구간 전체 최고점 중 T 이후가 차지하는 비율의 하한.
 *
 * 데이터랩은 **요청에 함께 넣은 키워드 그룹의 최댓값을 100으로** 정규화한다.
 * 그래서 여러 키워드를 한 번에 넣으면 절대 지수로는 비교가 불가능하다.
 * 키워드마다 따로 조회하면 그 키워드 자신의 최고점이 100이 되므로,
 * "그 최고점이 T 이후에 왔는가"가 곧 "T 이후에 터졌는가"가 된다.
 */
const POST_SHARE_FLOOR = 0.6;
/** 기준선이 0에 가까우면 배수가 폭발한다. 신규 등장은 따로 판정한다. */
const BASELINE_FLOOR = 1;

const asOf = process.argv[2];
if (!asOf || Number.isNaN(Date.parse(asOf))) {
  console.error("사용법: node scripts/predict-backtest.mjs <기준일 YYYY-MM-DD> [시드,시드]");
  process.exit(2);
}
const seeds = (process.argv[3] ?? "신상 디저트,유행 간식,편의점 신상")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const asOfMs = Date.parse(asOf);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

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

/** 주간 포인트를 기준 시점 기준으로 before/after 로 가른다. */
function split(weeks) {
  const before = weeks.filter((w) => Date.parse(w.period) <= asOfMs);
  const after = weeks.filter((w) => {
    const t = Date.parse(w.period);
    return t > asOfMs && t <= asOfMs + HORIZON_WEEKS * 7 * MS_DAY;
  });
  return { before, after };
}

/**
 * 채점 — 두 가지를 함께 본다.
 *   postShare = 구간 전체 최고점 대비 T 이후 최고점의 비율
 *               (키워드별 단독 조회라 자기 최고점이 100. 1.0 이면 최고의 순간이 T 이후)
 *   rise      = T 직전 4주 평균 대비 T 이후 최고점의 배수
 *
 * postShare 만 보면 이미 뜬 뒤 완만히 유지되는 것도 걸리고,
 * rise 만 보면 계절성 등락(김장철 김치 등)이 걸린다. 둘 다 요구한다.
 */
function grade(weeks) {
  const { before, after } = split(weeks);
  if (!after.length || !weeks.length) {
    return { verdict: "no-data", rise: null, postShare: null, weeksToPeak: null };
  }

  const windowMax = Math.max(...weeks.map((w) => w.ratio));
  const tail = before.slice(-4);
  const baselineRaw = tail.length ? tail.reduce((a, w) => a + w.ratio, 0) / tail.length : 0;

  let peak = after[0];
  for (const w of after) if (w.ratio > peak.ratio) peak = w;

  const postShare = windowMax > 0 ? peak.ratio / windowMax : 0;
  // 기준선이 사실상 0이면 "신규 등장" — 배수는 하한으로 눌러 폭발을 막는다.
  const emerged = baselineRaw < BASELINE_FLOOR;
  const rise = peak.ratio / Math.max(baselineRaw, BASELINE_FLOOR);
  const weeksToPeak = Math.round((Date.parse(peak.period) - asOfMs) / (7 * MS_DAY));

  let verdict = "miss";
  if (postShare >= POST_SHARE_FLOOR && rise >= HIT_MULTIPLE) verdict = "hit";
  else if (postShare >= POST_SHARE_FLOOR && rise >= 1.5) verdict = "partial";

  return { verdict, rise, postShare, weeksToPeak, baseline: baselineRaw, emerged };
}

/** T 시점까지의 데이터만으로 "검색도 이미 오르고 있었나"를 판정 (이중 확인). */
function searchConfirmedAt(weeks) {
  const { before } = split(weeks);
  if (before.length < 5) return false;
  const last4 = before.slice(-4).reduce((a, w) => a + w.ratio, 0) / 4;
  const prev4 = before.slice(-8, -4);
  if (!prev4.length) return false;
  const prevAvg = prev4.reduce((a, w) => a + w.ratio, 0) / prev4.length;
  return prevAvg > 0 && last4 / prevAvg >= 1.3;
}

console.log(`기준 시점 : ${asOf}  (이 시점 이후 데이터는 발굴에 쓰지 않음)`);
console.log(`시드      : ${seeds.join(", ")}`);
console.log(`채점      : 이후 ${HORIZON_WEEKS}주 내 피크가 기준 대비 ${HIT_MULTIPLE}배 이상 → 히트\n`);

// 컷오프. 실측 결과 넓혀도(60) 정밀도가 오히려 떨어졌다 —
// 초기 신호는 순위 아래에 숨은 게 아니라 그 시점 코퍼스에 아직 없기 때문.
// 그래서 좁게(15) 둔다. 재실험하려면 TOPN 환경변수로 조절.
const TOPN = Number(process.env.TOPN ?? 15);

// ① 과거 시점 발굴 재현
let disc;
try {
  disc = await post("/api/global/discover", {
    seeds,
    region: "KR",
    asOf,
    topN: TOPN,
    // RECENT_DAYS 로 관측 창을 조절(기본 14). 짧을수록 확산 초기에 민감(A/B 검증용).
    ...(process.env.RECENT_DAYS ? { recentDays: Number(process.env.RECENT_DAYS) } : {}),
  });
} catch (e) {
  console.error("발굴 실패:", e.message);
  process.exit(1);
}
const candidates = (disc.candidates ?? [])
  .filter((c) => !c.term.includes(" "))
  .slice(0, TOPN)
  .map((c) => ({ term: c.term.replace(/^#/, ""), lift: c.lift, dfRecent: c.dfRecent, novel: c.novel }));

console.log(`① 발굴 후보 ${candidates.length}개 (YouTube 쿼터 ${disc.quotaUnits ?? "?"} units)`);
if (!candidates.length) {
  console.log("후보가 없습니다. 시드나 기준 시점을 바꿔보세요.");
  process.exit(1);
}
console.log("   " + candidates.map((c) => c.term).join(", ") + "\n");

// ② 데이터랩 조회 — 기준 시점 전후를 모두 덮는 구간을 명시해야 한다.
//    (기본값은 최근 몇 주뿐이라 백테스트에 못 쓴다)
//    before 는 이중확인에, after 는 채점에만 쓴다.
const startDate = ymd(asOfMs - 365 * MS_DAY);
const endDate = ymd(Math.min(asOfMs + HORIZON_WEEKS * 7 * MS_DAY, Date.now()));
console.log(`   데이터랩 구간: ${startDate} ~ ${endDate}`);
// 키워드마다 따로 조회한다 — 함께 넣으면 그룹 최댓값 기준으로 정규화돼 비교가 깨진다.
const byTitle = new Map();
for (const c of candidates) {
  try {
    const dl = await post("/api/datalab", { keywords: [c.term], startDate, endDate });
    const row = (dl.results ?? dl ?? [])[0];
    byTitle.set(c.term, row?.data ?? []);
  } catch (e) {
    console.log(`   ⚠️  ${c.term}: 데이터랩 조회 실패 (${e.message})`);
    byTitle.set(c.term, []);
  }
}

// ③ 채점
const scored = candidates.map((c) => {
  const weeks = byTitle.get(c.term) ?? [];
  const g = grade(weeks);
  return { ...c, ...g, confirmed: searchConfirmedAt(weeks), weeks: weeks.length };
});

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const fmt = (v, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

console.log("② 이후 실적 채점\n");
console.log(
  "키워드".padEnd(14) +
    "이중확인".padEnd(9) +
    "상승배수".padEnd(10) +
    "이후비중".padEnd(9) +
    "피크주차".padEnd(9) +
    "판정",
);
console.log("-".repeat(64));
for (const s of scored.sort((a, b) => (b.postShare ?? 0) - (a.postShare ?? 0) || (b.rise ?? 0) - (a.rise ?? 0))) {
  console.log(
    s.term.padEnd(14) +
      (s.confirmed ? "✔ 확인" : "—").padEnd(9) +
      (s.rise === null ? "—" : (s.emerged ? "신규 ×" : "×") + fmt(s.rise)).padEnd(10) +
      (s.postShare === null ? "—" : Math.round(s.postShare * 100) + "%").padEnd(9) +
      (s.weeksToPeak === null ? "—" : `+${s.weeksToPeak}주`).padEnd(9) +
      { hit: "히트", partial: "부분", miss: "미발현", "no-data": "데이터없음" }[s.verdict],
  );
}

const usable = scored.filter((s) => s.verdict !== "no-data");
const hits = usable.filter((s) => s.verdict === "hit");
const dual = usable.filter((s) => s.confirmed);
const dualHits = dual.filter((s) => s.verdict === "hit");
const contentOnly = usable.filter((s) => !s.confirmed);
const contentOnlyHits = contentOnly.filter((s) => s.verdict === "hit");

console.log("\n③ 요약");
console.log(`   전체 정밀도        ${hits.length}/${usable.length}  (${pct(hits.length, usable.length)}%)`);
console.log(
  `   이중 확인 후보     ${dualHits.length}/${dual.length}  (${pct(dualHits.length, dual.length)}%)  ← 콘텐츠+검색 동시`,
);
console.log(
  `   콘텐츠만 후보      ${contentOnlyHits.length}/${contentOnly.length}  (${pct(contentOnlyHits.length, contentOnly.length)}%)`,
);
const leads = hits.map((s) => s.weeksToPeak).filter((v) => v !== null).sort((a, b) => a - b);
console.log(`   히트까지 중앙값    ${leads.length ? leads[Math.floor((leads.length - 1) / 2)] + "주" : "—"}`);

// 계절성 오탐은 "기존어 상승" 쪽에 몰린다. 나눠서 보여 준다.
const emergedHits = hits.filter((s) => s.emerged);
console.log(
  `   ├ 신규 등장 히트   ${emergedHits.length}건  (T 이전 검색량이 거의 0 → 새로 생긴 트렌드)`,
);
console.log(
  `   └ 기존어 상승 히트 ${hits.length - emergedHits.length}건  (계절성 반복이 섞일 수 있음)`,
);

const out = {
  asOf,
  seeds,
  horizonWeeks: HORIZON_WEEKS,
  hitMultiple: HIT_MULTIPLE,
  quotaUnits: disc.quotaUnits ?? null,
  // weeks(주간 원본)는 용량만 키우므로 저장에서 뺀다.
  candidates: scored.map((s) => {
    const copy = { ...s };
    delete copy.weeks;
    return copy;
  }),
  summary: {
    usable: usable.length,
    hits: hits.length,
    precision: pct(hits.length, usable.length),
    dual: dual.length,
    dualHits: dualHits.length,
    dualPrecision: pct(dualHits.length, dual.length),
    contentOnly: contentOnly.length,
    contentOnlyHits: contentOnlyHits.length,
    contentOnlyPrecision: pct(contentOnlyHits.length, contentOnly.length),
  },
};
mkdirSync(join(ROOT, "data"), { recursive: true });
const path = join(ROOT, "data", `predict-backtest-${asOf}.json`);
writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
console.log(`\n저장: data/predict-backtest-${asOf}.json`);
