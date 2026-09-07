/**
 * 지속성 백테스트 — "속성형 트렌드가 포맷 종속형보다 오래 가는가".
 *
 *   속성형   = 재료·속성이 이름인 것 (말차·우베·두바이·피스타치오)
 *             → 여러 제품에 얹힐 수 있어 하나가 식어도 다른 형태로 이어질 수 있다.
 *   포맷형   = 특정 제품 형태가 이름인 것 (버터떡·봄동비빔밥·두바이쫀득쿠키)
 *             → 그 제품이 식으면 같이 식는다.
 *
 * ⚠️ 판정 기준은 **결과를 보기 전에** 아래 상수로 고정한다. 결과에 맞춰 기준을 고르면
 *    그 결론은 데이터가 아니라 선택의 산물이 된다. 기준을 바꾸려면 바꾼 사실을 남길 것.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/persistence-backtest.mjs
 *   (dev 서버 필요 — /api/datalab 프록시를 쓴다. 유튜브 쿼터는 쓰지 않는다.)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// 데이터랩 검색어트렌드가 제공하는 가장 이른 날짜. 짧게 잡으면 구간 첫 주가 피크로 잡히는
// 좌측 절단이 생긴다 (2021 시작으로 돌렸을 때 흑임자·크로플이 그랬다).
const START = "2016-01-01";

/* ── 대상 (사용자 지정) ────────────────────────────────────── */
/* ── 대상 ──────────────────────────────────────────────────
 * 기본 세트는 사용자가 지정한 7개다. 다만 이 7개는 **전부 최근 50주 안에 피크**를 찍어
 * 52주 잔존율을 잴 수 없다 — 지속성 가설을 검증할 수 없는 표본이다.
 * `--set=old` 는 1년 이상 지난 피크를 가진 키워드로 같은 측정을 돌린다.
 * ⚠️ old 세트의 속성형/포맷형 분류는 **제안**이다. 도메인 판단이라 사용자가 확정해야 한다.
 */
const SETS = {
  user: {
    속성형: ["말차", "우베", "두바이", "피스타치오"],
    포맷형: ["버터떡", "봄동비빔밥", "두바이쫀득쿠키"],
  },
  old: {
    속성형: ["말차", "흑임자", "얼그레이", "인절미", "트러플", "바질"],
    포맷형: ["탕후루", "크로플", "약과", "소금빵", "먹태깡", "포켓몬빵"],
  },
};
const SET_NAME = (process.argv.find((a) => a.startsWith("--set=")) ?? "--set=user").slice(6);
const GROUPS = SETS[SET_NAME] ?? SETS.user;

/* ── 측정 규칙 ─────────────────────────────────────────────── */
/** 자기 최고치의 이 비율을 넘긴 주를 "떠 있는" 주로 센다. */
/** 피크가 조회 구간의 앞 이 주수 안에 있으면 좌측 절단으로 보고 판정에서 제외한다. */
const CENSOR_WEEKS = 26;
const SUSTAIN_LEVEL = 0.5;
/** 부상 시작 판정선 — 자기 최고치의 이 비율을 처음 넘긴 주. */
const RISE_LEVEL = 0.25;
/** 부상 이전 기준선을 재는 구간(주). 트렌드 이전에 이미 있던 검색량을 분리한다. */
const PRE_BASE_WEEKS = 26;
/** 잔존율을 재는 시점(피크 이후 주)과 그 주변 평활 폭. */
const RETENTION_POINTS = [26, 52];
const SMOOTH = 3;

/* ── 판정 기준 (결과 보기 전 고정) ─────────────────────────── */
/** C1: 속성형의 지속 주수 중앙값이 포맷형의 이 배수 이상. */
const C1_SUSTAIN_RATIO = 2.0;
/** C2: 기준선 보정 52주 잔존율이 두 그룹 간 **겹치지 않아야** 한다. */
const C2_REQUIRE_NO_OVERLAP = true;

/* ── 유틸 ──────────────────────────────────────────────────── */
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);

async function series(keyword) {
  const res = await fetch(`${BASE}/api/datalab`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    // 키워드를 하나씩 조회한다 — 데이터랩은 요청 안에서 최댓값을 100으로 정규화하므로,
    // 여러 개를 묶으면 작은 키워드가 0 근처로 눌려 곡선 모양을 못 본다.
    body: JSON.stringify({ keywords: [keyword], startDate: START, endDate: new Date().toISOString().slice(0, 10) }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${keyword}: ${j.error}`);
  return (j.results?.[0]?.data ?? []).map((d) => ({ period: d.period, ratio: d.ratio }));
}

function analyze(keyword, data) {
  const r = data.map((d) => d.ratio);
  if (r.length < 60) return { keyword, error: "표본 부족" };
  const peak = Math.max(...r);
  if (peak <= 0) return { keyword, error: "검색량 없음" };
  const peakIdx = r.indexOf(peak);
  // 피크가 구간 앞머리에 있으면 진짜 피크가 조회 구간 밖일 수 있다 → 판정에서 뺀다.
  const censored = peakIdx < CENSOR_WEEKS;

  const riseIdx = r.findIndex((v) => v >= peak * RISE_LEVEL);
  // 부상 이전 기준선 — 트렌드가 뜨기 전에 이미 있던 검색량(자기 최고치 대비 비율).
  const preWindow = r.slice(Math.max(0, riseIdx - PRE_BASE_WEEKS), Math.max(0, riseIdx));
  const preBase = preWindow.length >= 8 ? median(preWindow) / peak : null;

  const sustainWeeks = r.filter((v) => v >= peak * SUSTAIN_LEVEL).length;
  const weeksAfterPeak = r.length - 1 - peakIdx;

  const retention = {};
  for (const p of RETENTION_POINTS) {
    const lo = peakIdx + p - SMOOTH;
    const hi = peakIdx + p + SMOOTH;
    retention[p] = hi < r.length ? mean(r.slice(lo, hi + 1)) / peak : null;
  }
  // 기준선 보정 — 트렌드 이전부터 있던 검색량을 빼야 "트렌드가 남긴 것"만 남는다.
  const adj = (x) => (x == null || preBase == null || preBase >= 1 ? null : Math.max(0, (x - preBase) / (1 - preBase)));

  return {
    keyword,
    r,
    peakIdx,
    peak,
    censored,
    peakPeriod: data[peakIdx]?.period,
    weeksAfterPeak,
    preBase,
    sustainWeeks,
    ret26: retention[26],
    ret52: retention[52],
    adjRet52: adj(retention[52]),
  };
}

/* ── 실행 ──────────────────────────────────────────────────── */
const rows = {};
for (const [label, terms] of Object.entries(GROUPS)) {
  rows[label] = [];
  for (const t of terms) {
    try {
      rows[label].push(analyze(t, await series(t)));
    } catch (e) {
      rows[label].push({ keyword: t, error: e.message });
    }
  }
}

/**
 * ⚠️ 관측 창을 맞춘다. 지속주수를 전체 구간에서 세면 **먼저 뜬 키워드가 유리하다** —
 *    말차는 피크 후 50주를 봤고 우베는 17주뿐이라, 그대로 비교하면 관측 기간의 차이를
 *    지속력의 차이로 착각한다. 모든 키워드가 공통으로 관측한 주수(W)로 잘라서 센다.
 */
const analyzed = Object.values(rows).flat().filter((x) => !x.error);
const W = Math.min(...analyzed.map((x) => x.weeksAfterPeak));
for (const x of analyzed) {
  const win = x.r.slice(x.peakIdx, x.peakIdx + W + 1);
  x.sustainInW = win.filter((v) => v >= x.peak * SUSTAIN_LEVEL).length;
}

console.log(`세트 ${SET_NAME} · 대상 기간 ${START} ~ 현재 · 주간`);
console.log(`공통 관측 창 W = 피크 이후 ${W}주 (가장 최근에 뜬 키워드에 맞춤)` + String.fromCharCode(10));
for (const [label, list] of Object.entries(rows)) {
  console.log(`── ${label} ──`);
  console.log(
    "키워드".padEnd(14),
    "피크".padEnd(12),
    "피크후".padStart(6),
    "이전기준선".padStart(10),
    `지속(W${W})`.padStart(9),
    "26주잔존".padStart(9),
    "52주잔존".padStart(9),
    "보정52".padStart(8),
  );
  for (const x of list) {
    if (x.error) { console.log(x.keyword.padEnd(14), `(${x.error})`); continue; }
    console.log(
      (x.censored ? `${x.keyword}*` : x.keyword).padEnd(14),
      String(x.peakPeriod).padEnd(12),
      String(x.weeksAfterPeak).padStart(6),
      pct(x.preBase).padStart(10),
      String(x.sustainInW).padStart(9),
      pct(x.ret26).padStart(9),
      pct(x.ret52).padStart(9),
      pct(x.adjRet52).padStart(8),
    );
  }
  console.log();
}

/* ── 판정 ──────────────────────────────────────────────────── */
// 좌측 절단 항목은 피크 자체가 의심스러우므로 판정에서 뺀다 (표에는 * 로 남긴다).
const ok = (list) => list.filter((x) => !x.error && !x.censored);
const A = ok(rows["속성형"]);
const F = ok(rows["포맷형"]);

const sustainA = median(A.map((x) => x.sustainInW));
const sustainF = median(F.map((x) => x.sustainInW));
const c1 = sustainF > 0 && sustainA / sustainF >= C1_SUSTAIN_RATIO;

const adjA = A.map((x) => x.adjRet52).filter((v) => v != null);
const adjF = F.map((x) => x.adjRet52).filter((v) => v != null);
const measurable = adjA.length && adjF.length;
const c2 = measurable ? Math.min(...adjA) > Math.max(...adjF) : null;

const censoredList = Object.values(rows).flat().filter((x) => x.censored).map((x) => x.keyword);
if (censoredList.length) console.log(`* 좌측 절단(피크가 조회 구간 앞 ${CENSOR_WEEKS}주 안) — 판정에서 제외: ${censoredList.join(", ")}
`);
console.log("── 사전 등록 판정 ──");
console.log(`C1 공통창(피크+${W}주) 지속주수 중앙값 — 속성형 ${sustainA} vs 포맷형 ${sustainF} (기준 ${C1_SUSTAIN_RATIO}배 이상) → ${c1 ? "충족" : "미충족"}`);
if (measurable) {
  console.log(`C2 보정 52주 잔존율 겹침 — 속성형 최소 ${pct(Math.min(...adjA))} vs 포맷형 최대 ${pct(Math.max(...adjF))} → ${c2 ? "겹치지 않음(충족)" : "겹침(미충족)"}`);
} else {
  console.log(`C2 보정 52주 잔존율 — **측정 불가**: 피크 이후 52주가 지나지 않은 항목이 있어 비교 대상이 부족하다 (속성형 ${adjA.length}건 / 포맷형 ${adjF.length}건)`);
}

const verdict = c1 && (C2_REQUIRE_NO_OVERLAP ? c2 === true : true) ? "확증"
  : (c1 || c2 === true) ? "부분 확증" : "반증";
console.log(`\n판정: ${verdict}`);
console.log(`표본 n = 속성형 ${A.length} · 포맷형 ${F.length} — 통계적 검정을 하기엔 너무 작다. 패턴 관찰로만 읽을 것.`);

// 교란 요인 보고 — 속성형이 원래 넓은 말이라 오래 가는 것처럼 보일 수 있다.
const baseA = median(A.map((x) => x.preBase).filter((v) => v != null));
const baseF = median(F.map((x) => x.preBase).filter((v) => v != null));
console.log(`\n교란 확인 — 부상 이전 기준선 중앙값: 속성형 ${pct(baseA)} vs 포맷형 ${pct(baseF)}`);
console.log("  이 값이 속성형에서 크게 높으면, '오래 간다'가 아니라 '원래 넓은 말이었다'를 재고 있을 수 있다.");
console.log("  보정 52주 잔존율(adjRet52)은 이 기준선을 뺀 값이므로 그쪽을 우선해서 볼 것.");
