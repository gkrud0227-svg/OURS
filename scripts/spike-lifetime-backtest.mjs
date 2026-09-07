/**
 * 확장형 수명 백테스트 — "여러 제품으로 번지는 확장형이 그 형태로만 존재하는
 * 비확장형보다 오래 가는가".
 *
 * 두 지표를 낸다.
 *   · 감지시점 — 대시보드의 급상승 로직(backtestKeyword)이 처음 신호를 낸 때의
 *     곡선 높이(피크 대비 %). 낮을수록 초기에 잡았다는 뜻.
 *   · 스파이크 수명 — 자기 최고치의 50% 이상을 유지한 **누적 주 수**.
 *     (기존 장표 7건의 값을 역산해 이 정의로 확정했다: 누적·50% 에서 5/7 일치)
 *
 * ⚠️ **아직 식지 않은 키워드의 수명은 확정값이 아니다.** 마지막 주가 여전히 50% 위면
 *    수명은 계속 늘어난다. 실제로 기존 장표의 양쯔깐루(11주)·왁뿌소금빵(6주)은 지금
 *    다시 재면 각각 17주·12주다 — 장표를 만든 뒤에도 계속 뜨고 있었기 때문이다.
 *    그런 항목은 "진행 중"으로 표시하고 평균에서 빼거나 하한값으로 읽어야 한다.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/spike-lifetime-backtest.mjs
 *   (dev 서버 필요 — /api/datalab 프록시. 유튜브 쿼터는 쓰지 않는다.)
 */

import { backtestKeyword } from "../src/lib/backtest.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const START = "2022-01-01";

/** 자기 최고치의 이 비율 이상인 주를 "떠 있는" 주로 센다. */
const LIFETIME_LEVEL = 0.5;

/**
 * 대상. 분류는 도메인 판단이라 여기에 명시해 둔다.
 *   확장형   = 재료·속성이라 여러 제품에 얹힌다
 *   비확장형 = 특정 제품 형태 하나로만 존재한다
 */
const SETS = {
  // 현재 요청 세트
  new: [
    { term: "피스타치오", kind: "확장형" },
    { term: "두바이", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "두쫀쿠", kind: "비확장형", fallback: "두바이쫀득쿠키" },
    { term: "버터떡", kind: "비확장형" },
    { term: "왁뿌소금빵", kind: "비확장형" },
  ],
  // 왁뿌소금빵(제품) 대신 왁뿌(브랜드)로 바꿔 확장형으로 본 세트.
  // 브랜드는 여러 제품으로 번지므로 재료·속성과 같은 자리에 놓을 수 있는지 확인용.
  brand: [
    { term: "피스타치오", kind: "확장형" },
    { term: "두바이", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "왁뿌", kind: "확장형" },
    { term: "두쫀쿠", kind: "비확장형", fallback: "두바이쫀득쿠키" },
    { term: "버터떡", kind: "비확장형" },
  ],
  // 일반어(피스타치오·두바이)를 빼고 곡선이 깨끗한 신조어·브랜드만 남긴 4:4 세트.
  // 상시 검색량이 큰 일반어는 피크가 큰 기반 위 좁은 스파이크가 되어 수명이 인위적으로 짧게 잡힌다
  // (리드타임 159주·215주가 그 증거 — 신호가 아무 때나 뜬다는 뜻).
  clean: [
    { term: "탕후루", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "왁뿌", kind: "확장형" },
    { term: "두바이쫀득쿠키", kind: "비확장형" },
    { term: "왁뿌소금빵", kind: "비확장형" },
    { term: "봄동비빔밥", kind: "비확장형" },
    { term: "버터떡", kind: "비확장형" },
  ],
  // clean 세트에 비확장형 2건(초코바게트·호박인절미)을 더해 표본을 늘린 세트.
  clean2: [
    { term: "탕후루", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "왁뿌", kind: "확장형" },
    { term: "두바이쫀득쿠키", kind: "비확장형" },
    { term: "왁뿌소금빵", kind: "비확장형" },
    { term: "봄동비빔밥", kind: "비확장형" },
    { term: "버터떡", kind: "비확장형" },
    { term: "초코바게트", kind: "비확장형" },
    { term: "호박인절미", kind: "비확장형" },
  ],
  // 최종 세트 — clean2 에 말차(확장형)를 더한 5:6.
  // ⚠️ 말차는 상시 검색되는 재료어라 조회 구간에 따라 감지시점이 6~41% 로 흔들린다.
  //    (2016 시작 6% · 2022 시작 33% · 2025 시작 41%) 구간은 반드시 2022-01-01 로 고정할 것.
  final: [
    { term: "탕후루", kind: "확장형" },
    { term: "말차", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "왁뿌", kind: "확장형" },
    { term: "두바이쫀득쿠키", kind: "비확장형" },
    { term: "왁뿌소금빵", kind: "비확장형" },
    { term: "초코바게트", kind: "비확장형" },
    { term: "호박인절미", kind: "비확장형" },
    { term: "봄동비빔밥", kind: "비확장형" },
    { term: "버터떡", kind: "비확장형" },
  ],
  // 기존 장표(7/30)에 실린 세트 — 같은 정의로 지금 다시 재보기 위한 대조군
  old: [
    { term: "탕후루", kind: "확장형" },
    { term: "양쯔깐루", kind: "확장형" },
    { term: "우베", kind: "확장형" },
    { term: "두바이쫀득쿠키", kind: "비확장형" },
    { term: "왁뿌소금빵", kind: "비확장형" },
    { term: "봄동비빔밥", kind: "비확장형" },
    { term: "버터떡", kind: "비확장형" },
  ],
};
const SET_NAME = (process.argv.find((a) => a.startsWith("--set=")) ?? "--set=new").slice(6);
const TARGETS = SETS[SET_NAME] ?? SETS.new;

/** 데이터랩은 연속 호출을 간헐적으로 막는다. 사이를 띄우고 한 번 더 시도한다. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = 1200;

async function series(keyword) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await seriesOnce(keyword);
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(2500 * (attempt + 1));
    }
  }
  return [];
}

async function seriesOnce(keyword) {
  const res = await fetch(`${BASE}/api/datalab`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      keywords: [keyword],
      startDate: START,
      endDate: new Date().toISOString().slice(0, 10),
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return (j.results?.[0]?.data ?? []).map((d) => ({ period: d.period, ratio: d.ratio }));
}

/** 검색 신호가 있다고 볼 만한 곡선인가 — 0 만 잔뜩이면 그 표기로는 안 잡힌다. */
const hasSignal = (weeks) => weeks.filter((w) => w.ratio > 0).length >= 4;

function lifetime(weeks) {
  const peak = Math.max(...weeks.map((w) => w.ratio));
  if (peak <= 0) return { weeks: 0, ongoing: false };
  const limit = peak * LIFETIME_LEVEL;
  return {
    weeks: weeks.filter((w) => w.ratio >= limit).length,
    // 마지막 주가 아직 위면 수명이 안 끝났다 — 값은 하한이다.
    ongoing: weeks[weeks.length - 1].ratio >= limit,
  };
}

const rows = [];
for (const t of TARGETS) {
  await sleep(PACE_MS);
  let used = t.term;
  let weeks = [];
  try {
    weeks = await series(t.term);
    if (!hasSignal(weeks) && t.fallback) {
      const alt = await series(t.fallback);
      if (hasSignal(alt)) {
        weeks = alt;
        used = t.fallback;
      }
    }
  } catch (e) {
    rows.push({ ...t, error: e.message });
    continue;
  }
  if (!hasSignal(weeks)) {
    rows.push({ ...t, used, error: "검색 신호 없음" });
    continue;
  }
  const bt = backtestKeyword(used, weeks);
  const lt = lifetime(weeks);
  rows.push({
    ...t,
    used,
    peak: bt.peakPeriod,
    caught: bt.caughtAtPctOfPeak,
    lead: bt.leadWeeks,
    verdict: bt.verdict,
    life: lt.weeks,
    ongoing: lt.ongoing,
  });
}

console.log(`세트 ${SET_NAME} · 대상 기간 ${START} ~ 현재 · 주간 · 수명 = 자기 최고치의 ${LIFETIME_LEVEL * 100}% 이상 누적 주\n`);
console.log(
  "키워드".padEnd(14), "유형".padEnd(8), "조회어".padEnd(16),
  "피크".padEnd(12), "감지시점".padStart(8), "리드".padStart(6), "수명".padStart(6),
);
for (const r of rows) {
  if (r.error) {
    console.log(r.term.padEnd(14), r.kind.padEnd(8), `(${r.error})`);
    continue;
  }
  console.log(
    r.term.padEnd(14),
    r.kind.padEnd(8),
    (r.used === r.term ? "—" : r.used).padEnd(16),
    String(r.peak).padEnd(12),
    (r.caught == null ? "—" : `${r.caught}%`).padStart(8),
    (r.lead == null ? "—" : `${r.lead}주`).padStart(6),
    `${r.life}주${r.ongoing ? "+" : ""}`.padStart(6),
  );
}

const ok = rows.filter((r) => !r.error);
const before = ok.filter((r) => r.lead != null && r.lead > 0);
console.log(`\n피크 전 감지: ${before.length}/${ok.length}`);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
for (const kind of ["확장형", "비확장형"]) {
  const g = ok.filter((r) => r.kind === kind);
  const done = g.filter((r) => !r.ongoing);
  const m = mean(g.map((r) => r.life));
  const mDone = mean(done.map((r) => r.life));
  console.log(
    `${kind} (n=${g.length}) 수명 평균 ${m?.toFixed(1)}주` +
      (done.length < g.length
        ? `  ⚠️ 진행 중 ${g.length - done.length}건 포함 — 확정분만 보면 ${
            done.length ? `${mDone.toFixed(1)}주 (n=${done.length})` : "표본 없음"
          }`
        : ""),
  );
}

// 장표 KPI 로 쓸 요약 — 숫자를 손으로 옮기지 않도록 여기서 계산해 둔다.
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const caughts = ok.map((r) => r.caught).filter((v) => v != null);
const exp = ok.filter((r) => r.kind === "확장형").map((r) => r.life);
const non = ok.filter((r) => r.kind === "비확장형").map((r) => r.life);
console.log("\n── 장표 KPI ──");
console.log(`피크 전 감지        ${before.length}/${ok.length}`);
console.log(
  `감지시점 중앙값      ${median(caughts)}%  (${caughts.length}건 중 ${caughts.filter((v) => v <= 12).length}건이 12% 이하 · 최댓값 ${Math.max(...caughts)}%)`,
);
console.log(
  `수명 확장형/비확장형  ${mean(exp).toFixed(1)}주 vs ${mean(non).toFixed(1)}주 = ${(mean(exp) / mean(non)).toFixed(1)}배`,
);
console.log(`수명 중앙값          확장형 ${median(exp)}주 · 비확장형 ${median(non)}주`);

const ongoing = ok.filter((r) => r.ongoing).map((r) => r.term);
if (ongoing.length) {
  console.log(`\n⚠️ 아직 식지 않아 수명이 **확정되지 않은** 키워드: ${ongoing.join(", ")}`);
  console.log("   표의 값은 하한(+)이며 앞으로 더 늘어난다. 평균 비교에 넣으면 결론이 흔들린다.");
}
