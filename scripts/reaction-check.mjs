/**
 * 반응 지표 집계 검증 (쿼터 0 · 픽스처).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/reaction-check.mjs
 */
import { median, reactionOf } from "../src/lib/reaction.ts";

let fail = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fail += 1;
};

// ── 중앙값 ─────────────────────────────────────────────────
ok("median: 빈 배열은 null", median([]) === null);
ok("median: 홀수 개", median([3, 1, 2]) === 2);
ok("median: 짝수 개는 가운데 둘의 평균", median([1, 2, 3, 4]) === 2.5);
ok("median: 원본을 변형하지 않음", (() => { const a = [3, 1, 2]; median(a); return a[0] === 3; })());
ok("median: 한 개 대박에 안 휘둘림", median([1, 1, 1, 1, 1000]) === 1);

// ── 롱폼/쇼츠 분리 ─────────────────────────────────────────
const mixed = [
  { views: 1000, likes: 10, comments: 5, durationSec: 30, subs: 100 },   // 쇼츠 10x
  { views: 3000, likes: 30, comments: 9, durationSec: 45, subs: 100 },   // 쇼츠 30x
  { views: 200, likes: 4, comments: 2, durationSec: 600, subs: 100 },    // 롱폼 2x
  { views: 400, likes: 8, comments: 4, durationSec: 600, subs: 100 },    // 롱폼 4x
];
const r = reactionOf(mixed);
ok("쇼츠/롱폼을 섞지 않음 — 롱폼 중앙 3x", r.viewPerSubLong === 3);
ok("쇼츠/롱폼을 섞지 않음 — 쇼츠 중앙 20x", r.viewPerSubShort === 20);
ok("표본 수는 비율에 쓰인 영상 수", r.sampled === 4);
// 좋아요율 1%·1%·2%·2% → 중앙값 1.5%
ok("좋아요율 중앙값 1.5%", Math.abs(r.likeRate - 0.015) < 1e-9);

// ── 소형 채널 배제 (실측에서 구독자 1명 채널이 1305x로 순위를 지배했다) ──
const tiny = reactionOf([
  { views: 1305, likes: 1, comments: 0, durationSec: 30, subs: 1 },
  { views: 200, likes: 2, comments: 1, durationSec: 30, subs: 100 },
]);
ok("구독자 100 미만 채널은 비율에서 제외", tiny.viewPerSubShort === 2 && tiny.sampled === 1);

// ── 결측 처리: null 은 0 이 아니다 ──────────────────────────
const missing = reactionOf([
  { views: 1000, likes: null, comments: null, durationSec: 30, subs: null },
]);
ok("구독자 비공개면 비율 계산 제외", missing.viewPerSubShort === null && missing.sampled === 0);
ok("좋아요 비공개는 0%가 아니라 null", missing.likeRate === null);
ok("댓글 차단은 0%가 아니라 null", missing.commentRate === null);

// 좋아요 0 은 실제 값이므로 집계에 포함돼야 한다 (null 과 구분)
const zero = reactionOf([{ views: 1000, likes: 0, comments: 0, durationSec: 30, subs: 500 }]);
ok("좋아요 0은 실제 값으로 집계(비공개와 구분)", zero.likeRate === 0 && zero.commentRate === 0);

// ── 조회수 0 방어 ──────────────────────────────────────────
const noViews = reactionOf([{ views: 0, likes: 0, comments: 0, durationSec: 30, subs: 500 }]);
ok("조회수 0이면 나눗셈하지 않음", noViews.viewPerSubShort === null && noViews.likeRate === null);

// ── 빈 입력 ────────────────────────────────────────────────
const empty = reactionOf([]);
ok("빈 입력은 전부 null · 표본 0", empty.viewPerSubLong === null && empty.sampled === 0);

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
