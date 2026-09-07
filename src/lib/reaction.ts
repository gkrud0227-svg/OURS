/**
 * 후보의 **반응 지표** — "이 말이 담긴 영상이 실제로 잘 되나".
 *
 * 확산(채널 수)과 반응(영상 성과)은 서로 다른 질문이다. 확산은 넓이를, 반응은 깊이를 잰다.
 * 이 모듈은 반응만 계산하며, **순위에는 아직 쓰이지 않는다**(참고 지표).
 * 라우트에서 분리한 이유는 쿼터 없이 픽스처로 검증하기 위해서다 — scripts/reaction-check.mjs
 */

/** 집계에 필요한 최소 형태. 발굴 라우트의 Doc 이 구조적으로 이 모양을 만족한다. */
export interface ReactionInput {
  views: number;
  /** 좋아요 비공개면 null (0 과 구분한다). */
  likes: number | null;
  /** 댓글 차단이면 null. */
  comments: number | null;
  durationSec: number;
  /** 구독자 비공개면 null. */
  subs: number | null;
}

/** 중앙값 — 한 개의 대박 영상이 용어 전체를 대표하지 않도록 평균 대신 쓴다. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * 구독자가 이 수보다 적은 채널은 조회/구독 비율에서 제외한다.
 * 실측 분포가 중앙 2.0 인데 최대가 1305배(구독자 1명 채널)였다 — 소형 채널을 안 막으면
 * 비율 순위를 통째로 지배한다.
 */
const MIN_SUBS_FOR_RATIO = 100;
/** 쇼츠 경계(초). 쇼츠는 비구독자 배포라 롱폼과 같은 잣대로 비교할 수 없다. */
const SHORTS_MAX_SEC = 60;

export interface Reaction {
  /** 조회/구독 비율 중앙값 — 쇼츠 제외(롱폼만). 표본이 없으면 null. */
  viewPerSubLong: number | null;
  /** 조회/구독 비율 중앙값 — 쇼츠만. */
  viewPerSubShort: number | null;
  /** 좋아요율(좋아요/조회) 중앙값. */
  likeRate: number | null;
  /** 댓글율(댓글/조회) 중앙값. */
  commentRate: number | null;
  /** 비율 계산에 실제로 쓰인 영상 수 — 표본이 작으면 수치를 믿지 말라는 표시. */
  sampled: number;
}

/**
 * 용어별 **반응 지표**를 집계한다.
 *
 * ⚠️ 아직 **점수에 넣지 않는다.** 현행 순위는 채널 확산(lift) 그대로다. 이 값들은
 *    "이 말이 담긴 영상이 실제로 잘 되나"를 눈으로 보고 백테스트로 검증하기 위한 참고 지표다.
 *    확산(넓이)과 반응(깊이)은 서로 다른 질문이라, 검증 없이 섞으면 갓 태어난 트렌드가 죽는다.
 */
export function reactionOf(docs: ReactionInput[]): Reaction {
  const ratioLong: number[] = [];
  const ratioShort: number[] = [];
  const likeRates: number[] = [];
  const commentRates: number[] = [];
  for (const d of docs) {
    if (d.subs !== null && d.subs >= MIN_SUBS_FOR_RATIO && d.views > 0) {
      (d.durationSec > 0 && d.durationSec <= SHORTS_MAX_SEC ? ratioShort : ratioLong).push(d.views / d.subs);
    }
    if (d.views > 0 && d.likes !== null) likeRates.push(d.likes / d.views);
    if (d.views > 0 && d.comments !== null) commentRates.push(d.comments / d.views);
  }
  return {
    viewPerSubLong: median(ratioLong),
    viewPerSubShort: median(ratioShort),
    likeRate: median(likeRates),
    commentRate: median(commentRates),
    sampled: ratioLong.length + ratioShort.length,
  };
}
