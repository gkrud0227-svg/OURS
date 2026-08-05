/**
 * 커버리지 대조 — 네이버 자동완성 vs keywordstool 연관어.
 *
 * 같은 시드로 두 발굴 엔진을 돌려, **알려진 식품 신조어를 각각 몇 개 잡는지** 센다.
 * keywordstool 연관어는 어휘가 겹치거나 이미 검색량이 큰 것 위주라 초기/니치 신조어를
 * 놓친다는 가설을 정량 확인한다.
 *
 *   node scripts/ac-vs-keywordstool.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// 두 엔진에 똑같이 넣을 시드(재료·카테고리 어간).
const SEEDS = [
  "초콜릿", "두바이", "요아정", "탕후루", "소금빵", "약과",
  "크로플", "마라탕", "곰젤리", "말차", "흑임자", "티라미수",
];

// 커버리지를 잴 "알려진 식품 신조어" 목록(제품·트렌드명).
const TARGETS = [
  "두바이초콜릿", "두바이 쫀득쿠키", "요아정", "탕후루", "마라탕후루",
  "왁뿌소금빵", "약과쿠키", "크로플", "흑임자라떼", "밤티라미수",
  "먹태깡", "포켓몬빵", "생크림빵", "말차라떼",
];

const norm = (s) => (s ?? "").replace(/\s+/g, "").replace(/^#/, "").toLowerCase();

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `${path} ${res.status}`);
  return j;
}

/** 후보 집합에 타깃이 잡혔나 — 정규화 후 포함/일치. */
function hit(set, target) {
  const t = norm(target);
  for (const c of set) {
    const n = norm(c);
    if (n === t || n.includes(t) || t.includes(n)) return true;
  }
  return false;
}

console.log(`커버리지 대조 · 시드 ${SEEDS.length}개 · 타깃 신조어 ${TARGETS.length}개\n`);

let kwSet = new Set();
let acSet = new Set();
try {
  const kw = await post("/api/searchad", { seeds: SEEDS });
  kwSet = new Set((kw.candidates ?? []).map((c) => c.name ?? c.relKeyword ?? c.term ?? ""));
  console.log(`keywordstool 연관어: ${kwSet.size}개`);
} catch (e) {
  console.log(`keywordstool 실패: ${e.message}`);
}
try {
  const ac = await post("/api/naver-ac", { seeds: SEEDS });
  acSet = new Set((ac.candidates ?? []).map((c) => c.term));
  console.log(`자동완성 완성어:   ${acSet.size}개`);
} catch (e) {
  console.log(`자동완성 실패: ${e.message}`);
}

console.log("\n신조어         keywordstool   자동완성");
console.log("─".repeat(46));
let kwHit = 0, acHit = 0;
const acOnly = [];
for (const t of TARGETS) {
  const k = hit(kwSet, t), a = hit(acSet, t);
  if (k) kwHit++;
  if (a) acHit++;
  if (a && !k) acOnly.push(t);
  console.log(`${t.padEnd(14)} ${(k ? "✓" : "✗").padEnd(13)}  ${a ? "✓" : "✗"}`);
}
console.log("─".repeat(46));
console.log(`${"합계".padEnd(14)} ${String(kwHit + "/" + TARGETS.length).padEnd(13)}  ${acHit}/${TARGETS.length}`);
console.log(`\n자동완성 단독 발굴(keywordstool 놓침): ${acOnly.length}개 — ${acOnly.join(", ") || "없음"}`);
console.log(`\n⚠ keywordstool은 검색량/어휘 겹침 위주라 초기·니치 신조어를 놓치는 경향. 자동완성은 타이핑 초기 신호라 더 이르게 잡음.`);
