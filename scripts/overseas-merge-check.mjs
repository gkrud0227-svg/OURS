/**
 * 해외 두 소스 합치기 검증 (외부 호출 없음).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/overseas-merge-check.mjs
 */
import { mergeOverseasSources, pickMediaTerms, SOURCE_RANK } from "../src/lib/overseas-sources.ts";
import { judgeInflow } from "../src/lib/inflow.ts";

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fail += 1; };

const yt = (term, lift, dfRecent = 5) => ({
  term, lift, dfRecent, dfBaseline: 0, score: 50, views: 1000,
  hashtag: false, novel: true, examples: [`${term} video`], contextTag: "food", foodShare: 1,
});
const media = (term, novelty, sources) => ({
  term, count: sources.length, sources, sample: `${term} article`, novelty,
});

// ── 매체 후보는 새로 등장한 것만 가져온다 ──────────────────
// 기사 본문에서 뽑으면 상위가 chicken·cream 같은 일반 재료어(known)로 채워진다.
const picked = pickMediaTerms([
  media("chicken", "known", ["Eater", "Delish"]),
  media("qishta", "new", ["Eater", "NYT Dining"]),
  media("burrata", "rising", ["BBC Good Food"]),
  media("cream", "baseline", ["Eater"]),
]);
ok("매체: known 은 제외", !picked.some((t) => t.term === "chicken"));
ok("매체: baseline 도 제외", !picked.some((t) => t.term === "cream"));
ok("매체: new 는 포함", picked.some((t) => t.term === "qishta"));
ok("매체: rising 도 포함", picked.some((t) => t.term === "burrata"));

// ── 합치기 ────────────────────────────────────────────────
const merged = mergeOverseasSources(
  [yt("croissant", 5.1), yt("magnum", 3.5)],
  [media("croissant", "new", ["Eater", "Delish"]), media("qishta", "new", ["Eater", "NYT Dining"])],
);
const by = Object.fromEntries(merged.map((m) => [m.term, m]));

ok("양쪽에서 잡히면 source=both", by["croissant"].source === "both");
ok("유튜브만이면 source=youtube", by["magnum"].source === "youtube");
ok("매체만이면 source=media", by["qishta"].source === "media");
ok("합쳐도 중복 행이 생기지 않음", merged.length === 3);

ok("both: 두 소스 근거를 모두 남김",
   by["croissant"].lift === 5.1 && by["croissant"].mediaCount === 2);
ok("media 단독: lift 는 null (0 으로 채우지 않음)", by["qishta"].lift === null);
ok("media 단독: 채널 수도 null", by["qishta"].channels === null);
ok("youtube 단독: mediaCount 는 null", by["magnum"].mediaCount === null);
ok("예시는 소스에 맞는 것으로", by["qishta"].sample === "qishta article");

// ── 해외 생존 판단은 소스마다 근거가 다르다 ────────────────
ok("유튜브: lift 가 높으면 살아 있음", by["magnum"].overseasAlive === true);
ok("매체: 2곳 이상이면 살아 있음", by["qishta"].overseasAlive === true);
const oneSource = mergeOverseasSources([], [media("solo", "new", ["Eater"])]);
ok("매체: 1곳뿐이면 아직 신호로 안 봄", oneSource[0].overseasAlive === false);

const coldYt = mergeOverseasSources([yt("cold", 1.0)], [media("cold", "new", ["Eater", "Delish"])]);
ok("both: 한쪽만 살아 있어도 살아 있는 것으로",
   coldYt[0].overseasAlive === true && coldYt[0].source === "both");

// ── 판정으로 넘어갈 때 lift 없는 후보가 불이익을 받지 않는다 ──
const weeks = (...r) => r.map((ratio, i) => ({ period: `2026-0${(i % 9) + 1}-01`, ratio }));
const rising = weeks(5, 6, 10, 14, 20, 26);
const mediaJudge = judgeInflow({ lift: null, overseasAlive: true, weeks: rising, volumeTotal: 4000 });
ok("매체 단독도 '유입 중' 이 될 수 있다", mediaJudge.status === "arriving");
const noFlag = judgeInflow({ lift: null, weeks: rising, volumeTotal: 4000 });
ok("근거를 안 주면 lift 로 판단해 '지연 유입'", noFlag.status === "late");

// ── 정렬 보조 ─────────────────────────────────────────────
ok("정렬: both 가 단독 소스보다 위", SOURCE_RANK.both > SOURCE_RANK.youtube);
ok("정렬: 유튜브와 매체는 동급", SOURCE_RANK.youtube === SOURCE_RANK.media);

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
