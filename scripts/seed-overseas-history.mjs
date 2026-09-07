/**
 * 해외 매체 이력 기준선 재구성.
 *
 * 문제: 해외/국내 이력을 분리하면서 해외 이력이 **오늘 스캔 2회**로만 만들어졌다.
 * 오늘 기사로 기준선을 세우고 같은 기사를 판정하니 전부 known 이 된다 — 순환이다.
 *
 * 해결: 기존 통합 이력(2026-07-28부터 24회, 15,854개)에서 **라틴 문자 용어만** 뽑아
 * 해외 기준선으로 삼는다. 그 용어들은 해외 매체(Guardian·Eater·NYT…)에서 온 것이고,
 * 한글이 섞인 용어는 국내 전문지 유래라 제외한다.
 *
 * ⚠️ 이력을 **지우면 안 된다.** 지우면 다음 스캔에서 chicken·cream·butter 까지 전부
 *    "new" 가 되어 랭킹이 일반어로 뒤덮인다. 신규성은 "본 적 없다"는 뜻이어야 한다.
 *
 *   node scripts/seed-overseas-history.mjs [--apply]
 *   (--apply 없으면 무엇을 바꿀지만 보여준다)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "data");
const SRC = join(DATA, "news-history.json");
const DST = join(DATA, "news-history-overseas.json");
const apply = process.argv.includes("--apply");

/** 라틴 문자·숫자·공백·아포스트로피·하이픈만으로 이뤄진 용어 = 해외 매체 유래로 본다. */
const isLatin = (t) => /^[a-z0-9 '\-]+$/i.test(t);

if (!existsSync(SRC)) {
  console.log(`기존 통합 이력이 없습니다: ${SRC}`);
  process.exit(1);
}

const oldHistory = JSON.parse(readFileSync(SRC, "utf8"));
const current = existsSync(DST) ? JSON.parse(readFileSync(DST, "utf8")) : {};

const seeded = {};
for (const [term, h] of Object.entries(oldHistory)) {
  if (!isLatin(term)) continue;
  // recent 창이 없는 예전 형식은 maxSources 로 폴백된다(news-novelty.ts recentAverage).
  seeded[term] = h;
}

// 오늘 만들어진 해외 이력 중 기존에 없던 용어는 살린다 — 오늘 처음 본 말이 맞다.
let kept = 0;
for (const [term, h] of Object.entries(current)) {
  if (!seeded[term]) {
    seeded[term] = h;
    kept += 1;
  }
}

console.log(`기존 통합 이력      ${Object.keys(oldHistory).length}개`);
console.log(`  → 라틴 문자만     ${Object.keys(oldHistory).filter(isLatin).length}개 (해외 기준선)`);
console.log(`오늘 만든 해외 이력  ${Object.keys(current).length}개`);
console.log(`  → 기존에 없던 것  ${kept}개 (유지)`);
console.log(`\n새 해외 이력       ${Object.keys(seeded).length}개`);

if (!apply) {
  console.log("\n(미적용 — 실제로 바꾸려면 --apply)");
  process.exit(0);
}

if (existsSync(DST)) {
  const backup = `${DST}.bak`;
  copyFileSync(DST, backup);
  console.log(`\n기존 파일 백업: ${backup}`);
}
writeFileSync(DST, JSON.stringify(seeded, null, 2));
console.log(`적용 완료: ${DST}`);
