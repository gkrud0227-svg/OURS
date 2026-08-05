import type { Keyword, ScoreKey, WeekPoint } from "./types";

/** 전주 대비 상승률이 이 값(%) 이상이면 "급상승"으로 분류. */
export const RISE_THRESHOLD = 30;

export type TrendStatus = "surge" | "up" | "flat" | "down" | "none";

/** 4주 흐름의 모양. */
export type TrendPattern =
  | "streak_up"
  | "rebound"
  | "streak_down"
  | "mixed"
  | "none";

export interface TrendStat {
  current: number | null;
  previous: number | null;
  /** 주 지표: 4주 흐름 반영 상승률(%) — 최근 2주 평균 vs 이전 2주 평균 */
  riseRate: number | null;
  /** 참고: 전주 대비 1주 변화율(%) */
  weeklyRate: number | null;
  status: TrendStatus;
  pattern: TrendPattern;
  /** 마지막 방향으로 연속된 주수 */
  streak: number;
}

export function lastWeeks(weeks: WeekPoint[], n = 4): WeekPoint[] {
  return weeks.slice(-n);
}

export function statusOf(riseRate: number): TrendStatus {
  if (riseRate >= RISE_THRESHOLD) return "surge";
  if (riseRate >= 5) return "up";
  if (riseRate > -5) return "flat";
  return "down";
}

/**
 * 레벨 게이트 — 검색이 %로는 올랐어도, 그 키워드 **자기 이력의 바닥 근처**에서
 * 꿈틀댄 거면 트렌드로 보지 않고 관망(flat)으로 낮춘다.
 *
 * 예: 삼립크림빵이 6개월 최고 대비 4% 수준에서 +8% "상승" → 실제론 바닥의 노이즈.
 * 자기 최고점 대비 비율이라 데이터랩 묶음 정규화(스케일 배수)에 불변이다.
 * 시리즈가 짧으면(<MIN_WEEKS_FOR_GATE) 이력 판단이 안 되므로 그대로 둔다.
 */
export const LEVEL_FLOOR_RATIO = 0.25;
const MIN_WEEKS_FOR_GATE = 8;

export function gateByLevel(status: TrendStatus, weeks: WeekPoint[]): TrendStatus {
  if (status !== "surge" && status !== "up") return status;
  if (weeks.length < MIN_WEEKS_FOR_GATE) return status;
  const max = Math.max(...weeks.map((w) => w.ratio));
  if (max <= 0) return status;
  const recent = weeks[weeks.length - 1].ratio;
  return recent < LEVEL_FLOOR_RATIO * max ? "flat" : status;
}

function pct(recent: number, prior: number): number {
  if (prior === 0) return recent > 0 ? 100 : 0;
  return ((recent - prior) / prior) * 100;
}

/** ±1% 미만 변화는 방향 없음(0)으로 본다. */
const SIGN_EPS = 1;

function deltaSign(prev: number, next: number): -1 | 0 | 1 {
  const r = pct(next, prev);
  if (r > SIGN_EPS) return 1;
  if (r < -SIGN_EPS) return -1;
  return 0;
}

function classify(signs: (-1 | 0 | 1)[]): {
  pattern: TrendPattern;
  streak: number;
} {
  if (!signs.length) return { pattern: "none", streak: 0 };
  const last = signs[signs.length - 1];
  if (last === 0) return { pattern: "mixed", streak: 0 };

  let streak = 0;
  for (let i = signs.length - 1; i >= 0 && signs[i] === last; i--) streak += 1;

  if (streak === signs.length) {
    return { pattern: last > 0 ? "streak_up" : "streak_down", streak };
  }
  const before = signs[signs.length - 1 - streak];
  if (last > 0 && before < 0) return { pattern: "rebound", streak };
  return { pattern: "mixed", streak };
}

/**
 * 최근 4주 데이터로 상승률·상태·흐름 패턴을 계산.
 * - riseRate: 최근 2주 평균 vs 이전 2주 평균 (한 주 노이즈 완화)
 * - weeklyRate: 전주 대비 1주 변화율 (참고)
 * - pattern: 3주 연속 상승 / 하락 후 반등 / 연속 하락 / 등락
 */
export function trendFromWeeks(weeks: WeekPoint[]): TrendStat {
  const w = lastWeeks(weeks, 4);
  const empty: TrendStat = {
    current: null,
    previous: null,
    riseRate: null,
    weeklyRate: null,
    status: "none",
    pattern: "none",
    streak: 0,
  };
  if (w.length === 0) return empty;
  if (w.length === 1) return { ...empty, current: w[0].ratio };

  const n = w.length;
  const current = w[n - 1].ratio;
  const previous = w[n - 2].ratio;
  const weeklyRate = pct(current, previous);

  let riseRate: number;
  if (n >= 4) {
    const prior = (w[n - 4].ratio + w[n - 3].ratio) / 2;
    const recent = (w[n - 2].ratio + w[n - 1].ratio) / 2;
    riseRate = pct(recent, prior);
  } else if (n === 3) {
    riseRate = pct((w[1].ratio + w[2].ratio) / 2, w[0].ratio);
  } else {
    riseRate = weeklyRate;
  }

  const signs: (-1 | 0 | 1)[] = [];
  for (let i = 1; i < n; i++) signs.push(deltaSign(w[i - 1].ratio, w[i].ratio));
  const { pattern, streak } = classify(signs);

  return {
    current,
    previous,
    riseRate,
    weeklyRate,
    status: statusOf(riseRate),
    pattern,
    streak,
  };
}

export function computeTrend(keyword: Keyword): TrendStat {
  return trendFromWeeks(keyword.weeks);
}

/**
 * 흐름 패턴 보너스(±): 연속 상승은 가산, 연속 하락은 감산 (주당 2점, 최대 ±6).
 * 반등·등락은 아직 방향이 확정되지 않았으므로 중립(0).
 */
export function patternBonus(pattern: TrendPattern, streak: number): number {
  const n = Math.min(Math.max(streak, 0), 3);
  if (pattern === "streak_up") return n * 2;
  if (pattern === "streak_down") return -n * 2;
  return 0;
}

/** 발굴 랭킹에 포함할 최소 월 검색량 (미만은 노이즈로 제외). */
export const MIN_DISCOVERY_VOLUME = 10_000;

/**
 * 로그 스케일 검색량 정규화(0~1).
 * 선형이면 최대 볼륨 하나가 만점을 독식하므로, 로그로 눌러 격차를 완만하게 만든다.
 */
export function volumeNorm(
  volume: number,
  maxVolume: number,
  minVolume: number = MIN_DISCOVERY_VOLUME,
): number {
  const lo = Math.log(Math.max(minVolume, 1));
  const hi = Math.log(Math.max(maxVolume, minVolume + 1));
  const v = Math.log(Math.max(volume, 1));
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

/**
 * 발굴 점수(0~100): 검색량(로그 정규화) + 상승률 + 흐름 패턴 보너스.
 * 검색량 40% + 상승률 60% 가중. 상승률은 -20%→0, +50%→1 로 매핑.
 */
export function discoveryScore(
  volume: number,
  maxVolume: number,
  riseRate: number | null,
  pattern: TrendPattern = "none",
  streak = 0,
): number {
  const v = volumeNorm(volume, maxVolume);
  const riseNorm =
    riseRate === null ? 0.35 : Math.max(0, Math.min(1, (riseRate + 20) / 70));
  const base = (0.4 * v + 0.6 * riseNorm) * 100;
  const score = base + patternBonus(pattern, streak);
  return Math.round(Math.max(0, Math.min(100, score)));
}

export const STATUS_META: Record<
  TrendStatus,
  { label: string; emoji: string }
> = {
  surge: { label: "급상승", emoji: "🔥" },
  up: { label: "상승", emoji: "📈" },
  flat: { label: "유지", emoji: "➡️" },
  down: { label: "하락", emoji: "📉" },
  none: { label: "데이터 없음", emoji: "—" },
};

/** 흐름 패턴 hover 설명. */
export const PATTERN_META: Record<TrendPattern, { desc: string }> = {
  streak_up: { desc: "여러 주 내리 상승 — 추세가 강함" },
  rebound: {
    desc: "직전까지 하락하다 마지막 주에 반등 — 지속 여부 확인 필요",
  },
  streak_down: { desc: "여러 주 내리 하락 — 식는 중" },
  mixed: { desc: "오르내림이 섞여 방향이 불분명" },
  none: { desc: "패턴을 판단할 주간 데이터가 부족함" },
};

export function patternLabel(pattern: TrendPattern, streak: number): string {
  switch (pattern) {
    case "streak_up":
      return `${streak}주 연속 상승`;
    case "streak_down":
      return `${streak}주 연속 하락`;
    case "rebound":
      return "하락 후 반등";
    case "mixed":
      return "등락(불안정)";
    default:
      return "—";
  }
}

/* ---------- 스코어카드 ---------- */

export const SCORE_MAX = 20;
export const SCORE_TOTAL_MAX = SCORE_MAX * 5;
export const GO_THRESHOLD = 80;

export const SCORE_META: { key: ScoreKey; label: string; hint: string }[] = [
  { key: "trendSignal", label: "트렌드 신호", hint: "검색·언급 급상승 강도" },
  { key: "scarcity", label: "희소성", hint: "시장 내 경쟁·포화가 낮을수록 높음" },
  { key: "vendingFit", label: "자판기 적합성", hint: "무인 자판기 판매·보관 적합도" },
  { key: "sourcing", label: "소싱 가능성", hint: "원재료·완제품 조달 용이성" },
  { key: "priceFit", label: "가격 적합성", hint: "목표 판매가 대비 원가 여유" },
];

export function totalScore(scores: Record<ScoreKey, number>): number {
  return SCORE_META.reduce((sum, m) => sum + (scores[m.key] || 0), 0);
}

export type VerdictKey = "go" | "improve" | "next";

export function verdict(total: number): {
  key: VerdictKey;
  label: string;
} {
  if (total >= GO_THRESHOLD) return { key: "go", label: "즉시 진행" };
  if (total >= 60) return { key: "improve", label: "조건 개선" };
  return { key: "next", label: "다음 후보" };
}

/** 상승률 내림차순 정렬(데이터 없음은 뒤로). */
export function byRiseDesc(a: Keyword, b: Keyword): number {
  const ra = computeTrend(a).riseRate;
  const rb = computeTrend(b).riseRate;
  if (ra === null && rb === null) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return rb - ra;
}
