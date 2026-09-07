/**
 * 해외→국내 유입 판정 + 표기 변환 검증 (외부 호출 없음).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/inflow-check.mjs
 */
import { judgeInflow, INFLOW_RANK, ARRIVED_VOLUME } from "../src/lib/inflow.ts";
import { spellFromDict, verifySpellings, looksKorean } from "../src/lib/translit.ts";
import { hangulSkeleton, latinSkeleton, skeletonScore, pickTransliteration } from "../src/lib/skeleton.ts";

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fail += 1; };

/** 주간 시계열 생성기 — 뒤 4주가 판정에 쓰인다. */
const weeks = (...ratios) => ratios.map((r, i) => ({ period: `2026-0${(i % 9) + 1}-01`, ratio: r }));

// ── 표기 미확인은 신호 없음과 다르다 (이 구분이 설계의 핵심) ──
const unknown = judgeInflow({ lift: 3, weeks: null });
ok("표기 미확인: null 은 별도 상태", unknown.status === "unknownSpelling");
ok("표기 미확인: 상승률을 지어내지 않음", unknown.riseRate === null);
const noSignal = judgeInflow({ lift: 3, weeks: weeks(0, 0, 0, 0, 0, 0) });
ok("신호 없음: 조회했는데 0이면 미유입", noSignal.status === "notYet");
ok("두 상태는 서로 다르다", unknown.status !== noSignal.status);

// ── 유입 중 — 해외 살아있고 국내 상승, 규모 작음 ──
const arriving = judgeInflow({ lift: 3.2, weeks: weeks(5, 6, 10, 14, 20, 26), volumeTotal: 4000 });
ok("유입 중: 해외 상승 + 국내 상승 + 소규모", arriving.status === "arriving");
ok("유입 중: 점수가 가장 높다", arriving.score > 70);

// ── 도착 완료 — 국내 규모가 이미 크다 ──
const arrived = judgeInflow({
  lift: 3.2, weeks: weeks(50, 55, 60, 70, 80, 90), volumeTotal: ARRIVED_VOLUME,
});
ok("도착 완료: 국내 규모가 크면 늦었다", arrived.status === "arrived");
ok("도착 완료가 유입 중보다 점수 낮다", arrived.score < arriving.score);

// ── 지연 유입 — 해외는 식었는데 국내만 오른다 ──
const late = judgeInflow({ lift: 1.0, weeks: weeks(5, 6, 10, 14, 20, 26), volumeTotal: 3000 });
ok("지연 유입: 해외 lift 가 낮으면 late", late.status === "late");
ok("지연 유입이 유입 중보다 점수 낮다", late.score < arriving.score);

// ── 정체 — 신호는 있는데 안 오른다 ──
const flat = judgeInflow({ lift: 3, weeks: weeks(20, 20, 20, 20, 20, 20), volumeTotal: 1000 });
ok("정체: 신호 있고 상승 없으면 도착 완료", flat.status === "arrived");

// ── 단발 스파이크는 유입이 아니다 ────────────────────────────
// 실측: 비리야니 37 41 48 38 40 40 100 40 → 상승률 +74% 로 "유입 중" 1위에 올랐지만,
// 한 주 튀고 곧바로 제자리였고 월간 검색량도 1,490건뿐이었다.
const spike = judgeInflow({ lift: 2.5, weeks: weeks(37, 41, 48, 38, 40, 40, 100, 40), volumeTotal: 1490 });
ok("단발 스파이크는 유입 중이 아니다", spike.status !== "arriving");
ok("단발 스파이크는 미유입으로", spike.status === "notYet");
// 반대로 마지막 주까지 올라 있으면 유입으로 본다.
const alive = judgeInflow({ lift: 2.5, weeks: weeks(37, 41, 48, 38, 40, 60, 80, 95), volumeTotal: 4000 });
ok("상승이 살아 있으면 유입 중 유지", alive.status === "arriving");

// ── 인도 명절어 시나리오 — 이 설계가 풀려던 실제 문제 ──
// 해외 lift 는 높은데 국내 검색이 전혀 없다 → 미유입으로 밀린다.
const festival = judgeInflow({ lift: 2.7, weeks: weeks(0, 0, 0, 0, 0, 0) });
ok("무관 트렌드(국내 신호 0)는 유입 중이 될 수 없다", festival.status !== "arriving");
ok("무관 트렌드는 유입 중보다 아래", INFLOW_RANK[festival.status] < INFLOW_RANK["arriving"]);

// ── 정렬 우선순위 ──
ok("정렬: 유입 중이 최상위", Math.max(...Object.values(INFLOW_RANK)) === INFLOW_RANK["arriving"]);
ok("정렬: 표기 미확인이 최하위", Math.min(...Object.values(INFLOW_RANK)) === INFLOW_RANK["unknownSpelling"]);

// ── 사전 표기 변환 ──
const dubai = spellFromDict("dubai chocolate");
ok("사전: 두 단어 조합", dubai.includes("두바이 초콜릿"));
ok("사전: 붙여쓴 형태도 생성", dubai.includes("두바이초콜릿"));
ok("사전: 대안 표기(초콜렛)도 포함", dubai.includes("두바이 초콜렛"));
ok("사전: 한 단어", spellFromDict("croissant").includes("크루아상"));
ok("사전: 대안 표기(크로와상)", spellFromDict("croissant").includes("크로와상"));
ok("사전: 모르는 말은 빈 배열(검색 발굴행)", spellFromDict("rakshabandhan").length === 0);
ok("사전: 일부만 알아도 빈 배열", spellFromDict("dubai rakshabandhan").length === 0);
ok("사전: 해시태그 접두 무시", spellFromDict("#croissant").includes("크루아상"));

// ── 한글 판정 ──
ok("한글 판정: 한글 있음", looksKorean("크루아상"));
ok("한글 판정: 영어만이면 false", !looksKorean("croissant"));

// ── 자동완성 실재 검증 ──
const completions = ["두바이 초콜릿 만들기", "두바이초콜릿 파는곳", "크루아상 맛집"];
ok("검증: 완성어에 부분 포함되면 통과",
   verifySpellings(["두바이 초콜릿"], completions).length === 1);
ok("검증: 띄어쓰기 차이를 흡수",
   verifySpellings(["두바이초콜릿"], completions).length === 1);
ok("검증: 지어낸 표기는 탈락",
   verifySpellings(["두바이초코렛"], completions).length === 0);
ok("검증: 완성어가 비면 전부 탈락",
   verifySpellings(["두바이 초콜릿"], []).length === 0);


// ── 자음 골격 음차 매칭 (LLM 대체) ─────────────────────────
// 한글 음차는 자음 사이에 "으"를 끼워 넣어 모음이 어긋난다. 자음만 남겨 비교한다.
ok("골격: 마그넘 → mgnm", hangulSkeleton("마그넘") === "mgnm");
ok("골격: magnum → mgnm", latinSkeleton("magnum") === "mgnm");
ok("골격: 겹자음 축약 (burrata rr→r)", latinSkeleton("burrata") === latinSkeleton("burata"));
ok("골격: 한글 없는 문자열은 빈 골격", hangulSkeleton("magnum") === "");

ok("음차 일치: magnum ↔ 마그넘", skeletonScore("magnum", "마그넘") === 1);
ok("음차 일치: biryani ↔ 비리야니", skeletonScore("biryani", "비리야니") === 1);
ok("음차 일치: burrata ↔ 부라타", skeletonScore("burrata", "부라타") === 1);
ok("무관어는 낮은 점수: burrata ↔ 치즈", skeletonScore("burrata", "치즈") < 0.3);
ok("무관어는 낮은 점수: magnum ↔ 커스터드", skeletonScore("magnum", "커스터드") < 0.3);

// 실제 검색 결과에서 뽑힌 낱말 무리 중 음차를 고른다.
// ⚠️ burrata 는 "치즈"(5회)가 "부라타"(4회)보다 자주 나온다 — 빈도로는 못 고른다.
ok("선택: 빈도가 아니라 음차로 고른다",
   pickTransliteration("burrata", ["치즈", "부라타", "해석좀", "급해서"]) === "부라타");
ok("선택: 백과사전 결과에서 고른다",
   pickTransliteration("biryani", ["인도", "비리야니", "요리", "축제"]) === "비리야니");
ok("선택: 음차가 없으면 null (지어내지 않는다)",
   pickTransliteration("rakshabandhan", ["인도", "축제", "선물"]) === null);
ok("선택: 빈 후보는 null", pickTransliteration("magnum", []) === null);

// 골격이 짧으면 아무 말에나 맞으므로 아예 시도하지 않는다 (실측 오탐 3건).
ok("짧은 골격은 시도 안 함: hai", pickTransliteration("hai", ["해외", "호주"]) === null);
ok("짧은 골격은 시도 안 함: dal", pickTransliteration("dal", ["달의", "달"]) === null);
ok("짧은 골격은 시도 안 함: funny", pickTransliteration("funny", ["퍼니", "재밌"]) === null);


console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
