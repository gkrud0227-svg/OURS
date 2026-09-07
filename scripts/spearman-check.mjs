/**
 * 카테고리 백테스트의 순수 계산 검증 — 순위상관 + SNS 선행 신호 (외부 호출 없음).
 *
 *   node scripts/spearman-check.mjs
 */
import { ranks, spearman, snsSignals } from "./category-backtest.mjs";

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fail += 1; };
const near = (a, b) => a != null && Math.abs(a - b) < 1e-9;

// ── 순위 ───────────────────────────────────────────────────
ok("ranks: 오름차순 순위", JSON.stringify(ranks([10, 30, 20])) === JSON.stringify([1, 3, 2]));
ok("ranks: 동점은 평균순위", JSON.stringify(ranks([5, 5, 9])) === JSON.stringify([1.5, 1.5, 3]));

// ── 순위상관 ───────────────────────────────────────────────
ok("spearman: 완전 양의 단조", near(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1));
ok("spearman: 완전 음의 단조", near(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1));
ok("spearman: 비선형이어도 단조면 1", near(spearman([1, 2, 3, 4], [1, 4, 9, 16]), 1));
ok("spearman: 표본 3 미만은 null", spearman([1, 2], [3, 4]) === null);
ok("spearman: 길이 불일치는 null", spearman([1, 2, 3], [1, 2]) === null);
ok("spearman: 한쪽이 상수면 null(분모 0)", spearman([1, 1, 1], [1, 2, 3]) === null);
// 손계산 대조: x=[1,2,3,4,5], y=[2,1,4,3,5] → Σd²=4, ρ = 1 − 6·4/(5·24) = 0.8
ok("spearman: 손계산 대조 0.8", near(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8));

// ── SNS 선행 신호 ──────────────────────────────────────────
const s1 = snsSignals("소금빵", [
  "자연도 소금빵 후기",        // 수식어 O · 재현 X
  "마늘소금빵 만들기 레시피",   // 수식어 O · 재현 O
  "집에서 소금빵 만들었어요",   // 재현 O
  "소금빵 맛집 투어",          // 용어가 맨 앞 → 수식어 없음
]);
ok("recipeShare: 4건 중 2건이 재현 시도 → 50%", near(s1.recipeShare, 0.5));
ok("videos: 입력 건수 그대로", s1.videos === 4);
ok("modifierDiv: 수식어가 잡힘(>0)", s1.modifierDiv > 0);

// 단일 SKU 는 수식어 변주도, 재현 시도도 안 생긴다
const s2 = snsSignals("먹태깡", ["먹태깡 드디어 구했다", "먹태깡 후기", "편의점 먹태깡 재입고"]);
ok("단일 SKU: 재현 시도 0%", s2.recipeShare === 0);
ok("단일 SKU: 수식어 다양성이 카테고리형보다 낮음", s2.modifierDiv < s1.modifierDiv);

ok("빈 입력은 0%가 아니라 null", (() => {
  const e = snsSignals("소금빵", []);
  return e.videos === 0 && e.recipeShare === null && e.modifierDiv === null;
})());

// 표본이 크다고 수식어 다양성이 자동으로 커지면 안 된다 (영상 수로 정규화)
const many = snsSignals("소금빵", Array(50).fill("자연도 소금빵 후기"));
ok("수식어 다양성은 영상 수로 정규화됨", many.modifierDiv <= 1 / 50 + 1e-9);

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
