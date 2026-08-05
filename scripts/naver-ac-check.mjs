/**
 * 네이버 자동완성 발굴 소스 검증.
 *   1) 순수 파서(parseAutocomplete/pickCandidates/mergeCandidates) 유닛 확인 (픽스처)
 *   2) 라이브 라우트(/api/naver-ac) 통합 확인 (dev 서버 필요)
 *
 *   node --experimental-strip-types scripts/naver-ac-check.mjs
 */
import {
  parseAutocomplete,
  pickCandidates,
  mergeCandidates,
  isNonFood,
  DEFAULT_AC_SEEDS,
} from "../src/lib/naver-ac.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fail++; };

// ── 1) 순수 함수 유닛 (픽스처) ─────────────────────────────
const fixture = {
  items: [[
    ["두바이", 0], ["두바이 쫀득쿠키", 0], ["두바이 초콜릿", 0],
    ["두바이 여행", 0], ["두바이 날씨", 0], ["두바이 찰떡파이", 0],
  ]],
};
const parsed = parseAutocomplete(fixture);
ok("parseAutocomplete: 6개 완성어 추출", parsed.length === 6);
ok("parseAutocomplete: 첫 항목 문자열", parsed[0] === "두바이");

const picked = pickCandidates("두바이", parsed);
const terms = picked.map((c) => c.term);
ok("pickCandidates: 시드 자기자신 제외", !terms.includes("두바이"));
ok("pickCandidates: 정보성(여행·날씨) 제외", !terms.includes("두바이 여행") && !terms.includes("두바이 날씨"));
const info = pickCandidates("마라탕", ["마라탕 재료", "마라탕 밀키트", "말차 녹차 차이", "요아정 꿀조합"]).map((c) => c.term);
ok("pickCandidates: 정보성 꼬리(재료·차이·꿀조합) 제외", !info.includes("마라탕 재료") && !info.includes("말차 녹차 차이") && !info.includes("요아정 꿀조합"));
ok("pickCandidates: 제품 완성어(밀키트) 유지", info.includes("마라탕 밀키트"));
ok("pickCandidates: 신조어(쫀득쿠키) 유지", terms.includes("두바이 쫀득쿠키"));
ok("pickCandidates: rank 1-base 부여", picked[0]?.rank >= 1);

const merged = mergeCandidates([
  [{ term: "소금빵", seed: "소금", rank: 3 }],
  [{ term: "소금빵", seed: "빵", rank: 1 }],
  [{ term: "말차라떼", seed: "말차", rank: 2 }],
]);
ok("mergeCandidates: 중복 제거(소금빵 1개)", merged.filter((c) => c.term === "소금빵").length === 1);
ok("mergeCandidates: 더 높은 순위 유지(rank 1)", merged.find((c) => c.term === "소금빵")?.rank === 1);
ok("mergeCandidates: rank 오름차순 정렬", merged[0].rank <= merged[merged.length - 1].rank);

ok("빈 입력 방어", parseAutocomplete({}).length === 0 && pickCandidates("x", []).length === 0);

// 비식품 게이트
ok("isNonFood: 크림 사이트(리셀)·젤리슈즈·마라선수 컷",
  isNonFood("크림 사이트") && isNonFood("젤리슈즈") && isNonFood("손흥민 선수"));
ok("isNonFood: 식품 신조어는 통과", !isNonFood("두바이 쫀득쿠키") && !isNonFood("소금빵") && !isNonFood("요아정"));
const gated = pickCandidates("크림빵", ["크림빵", "크림빵 사이트", "크림빵 리셀", "생크림빵"]).map((c) => c.term);
ok("pickCandidates: 비식품(사이트·리셀) 제외", !gated.includes("크림빵 사이트") && !gated.includes("크림빵 리셀"));
ok("pickCandidates: 식품 완성어 유지", gated.includes("생크림빵"));

// ── 2) 라이브 라우트 통합 ─────────────────────────────
console.log("\n── 라이브 /api/naver-ac (dev 서버) ──");
try {
  const seeds = DEFAULT_AC_SEEDS.slice(0, 6); // 새 기본 시드(정제됨)로 실제 출력 확인
  const res = await fetch(`${BASE}/api/naver-ac`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds }),
  });
  const j = await res.json();
  ok(`라우트 200 응답`, res.ok);
  ok(`후보 반환(>0)`, (j.candidates?.length ?? 0) > 0);
  if (j.candidates?.length) {
    console.log(`  후보 ${j.count}개 (예시):`,
      j.candidates.slice(0, 12).map((c) => `${c.term}[${c.seed}]`).join(", "));
  }
  if (j.notice) console.log("  notice:", j.notice);
} catch (e) {
  console.log("✗ 라이브 호출 실패(서버 꺼짐?):", e.message);
  fail++;
}

console.log(`\n기본 시드 ${DEFAULT_AC_SEEDS.length}개`);
console.log(fail ? `\n❌ 실패 ${fail}건` : `\n✅ 전부 통과`);
process.exit(fail ? 1 : 0);
