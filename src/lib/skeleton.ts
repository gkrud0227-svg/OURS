/**
 * 영어 ↔ 한글 음차 **자음 골격** 비교.
 *
 * 해외 후보(영어)를 국내 검색어(한글)로 바꿀 때, 후보 한글 낱말 여럿 중 어느 것이
 * 그 영어 단어의 음차인지 골라야 한다. 빈도로는 못 고른다 — burrata 를 검색하면
 * "치즈"(5회)가 "부라타"(4회)보다 자주 나온다.
 *
 * 한글 음차는 자음 사이에 **"으"를 끼워 넣는** 규칙이 있어 모음이 원어와 어긋난다
 * (magnum → 마그넘). 그래서 **자음만 남겨** 비교하면 잘 맞는다.
 *
 *   마그넘 → m g n m  ·  magnum → m g n m   → 1.00
 *   부라타 → b r d    ·  burrata → b r d    → 1.00
 *   치즈   → j j      ·  burrata → b r d    → 0.00
 *
 * ⚠️ 완벽하지 않다. 프랑스어·아랍어 유래처럼 철자와 발음이 먼 말은 점수가 낮다
 *    (croissant→크루아상 0.80 · knafeh→크나페 0.75). 그래서 이 점수는 **후보를 고르는**
 *    데만 쓰고, 최종 확정은 네이버 자동완성 실재 검증에 맡긴다.
 */

/** 한글 초성 19개의 로마자 근사값. */
const CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
/** 한글 종성 28개(무받침 포함)의 로마자 근사값. */
const JONG = [
  "", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg",
  "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s",
  "ss", "ng", "j", "ch", "k", "t", "p", "h",
];

/**
 * 조음 위치가 같은 자음을 한 글자로 접는다.
 * 음차 과정에서 유무성·격음 구분이 흔들리므로(t↔ㄷ/ㅌ, k↔ㄱ/ㅋ) 그 차이를 흡수한다.
 */
const FOLD: Record<string, string> = {
  g: "g", kk: "g", k: "g",
  d: "d", tt: "d", t: "d",
  b: "b", pp: "b", p: "b",
  j: "j", jj: "j", ch: "j",
  s: "s", ss: "s",
  n: "n", ng: "n",
  m: "m",
  r: "r", l: "r",
  h: "h",
};

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 한글 낱말의 자음 골격. 한글이 아닌 문자는 건너뛴다. */
export function hangulSkeleton(word: string): string {
  let out = "";
  for (const ch of word ?? "") {
    const code = ch.charCodeAt(0);
    if (code < HANGUL_BASE || code > HANGUL_LAST) continue;
    const idx = code - HANGUL_BASE;
    const cho = CHO[Math.floor(idx / 588)];
    const jong = JONG[idx % 28];
    for (const c of [cho, jong]) {
      const f = FOLD[c];
      if (f) out += f;
    }
  }
  return out;
}

/**
 * 영어 낱말의 자음 골격. 모음을 버리고, 한글 음차에서 같은 소리로 합쳐지는
 * 자음들을 FOLD 와 같은 대표음으로 맞춘다. 겹자음(rr·tt)은 하나로 줄인다.
 */
const LATIN_MAP: Record<string, string> = {
  c: "g", k: "g", q: "g", g: "g",
  t: "d", d: "d",
  p: "b", b: "b", f: "b", v: "b",
  j: "j", z: "j", ch: "j",
  s: "s", x: "gs",
  n: "n", m: "m",
  l: "r", r: "r",
  h: "h",
  y: "", w: "",
};

export function latinSkeleton(word: string): string {
  let out = "";
  for (const ch of (word ?? "").toLowerCase()) {
    if ("aeiou".includes(ch)) continue;
    if (!/[a-z]/.test(ch)) continue;
    const mapped = LATIN_MAP[ch] ?? ch;
    // 겹자음 축약 — burrata 의 rr 이 한글에선 ㄹ 하나로 간다.
    if (mapped && out[out.length - 1] !== mapped) out += mapped;
  }
  return out;
}

/** 편집거리 기반 유사도 (0~1). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

/**
 * 영어 낱말과 한글 낱말이 같은 말인지 0~1 로 점수화한다.
 * 여러 어절이면 각 어절을 이어 붙여 비교한다 ("dubai chocolate" ↔ "두바이 초콜릿").
 */
export function skeletonScore(english: string, korean: string): number {
  return similarity(
    latinSkeleton((english ?? "").replace(/\s+/g, "")),
    hangulSkeleton((korean ?? "").replace(/\s+/g, "")),
  );
}

/** 음차로 인정할 최소 점수. 실측상 정답은 0.6 이상, 무관한 말은 0.5 이하로 갈렸다. */
export const SKELETON_MIN = 0.6;

/**
 * 골격이 이 길이 미만이면 음차를 시도하지 않는다.
 *
 * 자음이 한두 개뿐이면 아무 말에나 맞아버린다 — 실측 오탐:
 *   hai(골격 "h") → "해외" · dal(골격 "dr") → "달의" · funny(골격 "bn") → "퍼니"
 * 셋 다 음차로는 그럴듯하지만 우리가 찾던 말이 아니다. 짧은 말은 사전에 넣어 해결한다.
 *
 * ⚠️ **양쪽 모두**에 적용해야 한다. 영어 쪽만 막았더니 delicious(골격 "drgs") → "딸기"(골격 "dg")
 *    처럼 짧은 한글 후보가 우연히 높은 점수를 받아 통과했다.
 */
export const MIN_SKELETON_LEN = 3;

/** 후보 한글 낱말들 중 음차로 가장 그럴듯한 것을 고른다. 기준 미달이면 null. */
export function pickTransliteration(english: string, candidates: string[]): string | null {
  // 골격이 너무 짧으면 판별력이 없다 — 시도하지 않고 미확인으로 남긴다.
  if (latinSkeleton((english ?? "").replace(/\s+/g, "")).length < MIN_SKELETON_LEN) return null;
  let best: { word: string; score: number } | null = null;
  for (const word of candidates) {
    // 후보 쪽 골격도 짧으면 우연히 맞을 수 있다.
    if (hangulSkeleton(word).length < MIN_SKELETON_LEN) continue;
    const score = skeletonScore(english, word);
    if (!best || score > best.score) best = { word, score };
  }
  return best && best.score >= SKELETON_MIN ? best.word : null;
}
