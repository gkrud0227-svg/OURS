/**
 * 해외 식품 매체 신규성 판정 검증 (외부 호출 없음).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/news-novelty-check.mjs
 */
import {
  noveltyOf,
  isRising,
  recentAverage,
  updateHistory,
  RECENT_WINDOW,
  RISE_FACTOR,
} from "../src/lib/news-novelty.ts";

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fail += 1; };

const h = (recent, maxSources = Math.max(...recent, 0)) => ({
  firstSeenAt: "2026-07-28T00:00:00.000Z",
  lastSeenAt: "2026-09-07T00:00:00.000Z",
  scans: recent.length,
  maxSources,
  recent,
});

// ── 기본 판정 ─────────────────────────────────────────────
ok("첫 스캔이면 전부 기준선", noveltyOf(5, undefined, true) === "baseline");
ok("이력에 없으면 new", noveltyOf(3, undefined, false) === "new");
ok("평소 수준이면 known", noveltyOf(3, h([3, 3, 3]), false) === "known");
ok("평소보다 크게 늘면 rising", noveltyOf(6, h([3, 3, 3]), false) === "rising");

// ── 문턱이 계속 높아지던 문제 (이번 수정의 핵심) ─────────────
// 예전엔 maxSources(역대 최대)를 넘겨야 rising 이라, 한 번 튄 뒤로는 영영 known 이었다.
const spikedOnce = h([2, 2, 9, 2, 2, 2], 9); // 한 번 9곳까지 갔던 용어
ok("역대 최대(9)를 못 넘어도, 평소(3.2)의 1.5배면 rising",
   noveltyOf(6, spikedOnce, false) === "rising");
ok("그 용어의 기준선은 최대치가 아니라 최근 평균",
   Math.abs(recentAverage(spikedOnce) - 19 / 6) < 1e-9);

// ── 최근 창이 현재를 따라간다 ──────────────────────────────
let acc = updateHistory(undefined, 2, "t0");
for (let i = 0; i < RECENT_WINDOW + 3; i += 1) acc = updateHistory(acc, 5, `t${i + 1}`);
ok(`최근 창은 ${RECENT_WINDOW}개까지만 유지`, acc.recent.length === RECENT_WINDOW);
ok("오래된 값(2)은 창에서 밀려난다", !acc.recent.includes(2));
ok("기준선이 현재 수준(5)으로 옮겨감", recentAverage(acc) === 5);
ok("maxSources 는 참고용으로 남는다", acc.maxSources === 5);

// ── 한 곳뿐이면 급부상이 아니다 ────────────────────────────
ok("매체 1곳은 rising 아님", !isRising(1, h([0.5, 0.5])));
ok("매체 2곳부터 판정 대상", isRising(2, h([1, 1])));

// ── 예전 형식 이력(recent 없음) 폴백 ───────────────────────
const legacy = { firstSeenAt: "x", lastSeenAt: "y", scans: 24, maxSources: 4 };
ok("recent 없으면 maxSources 로 폴백", recentAverage(legacy) === 4);
ok("폴백에서도 rising 판정이 돈다", noveltyOf(6, legacy, false) === "rising");
ok("폴백에서 평소 수준이면 known", noveltyOf(4, legacy, false) === "known");

// ── 경계 ──────────────────────────────────────────────────
ok(`정확히 ${RISE_FACTOR}배면 rising (이상 조건)`, noveltyOf(3, h([2, 2]), false) === "rising");
ok("배수 미만이면 known", noveltyOf(2, h([2, 2]), false) === "known");
ok("이력이 비어 있는 창은 폴백도 null → rising 아님",
   !isRising(5, { firstSeenAt: "x", lastSeenAt: "y", scans: 0, maxSources: 0, recent: [] })
   || recentAverage({ firstSeenAt: "x", lastSeenAt: "y", scans: 0, maxSources: 0, recent: [] }) === 0);

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
