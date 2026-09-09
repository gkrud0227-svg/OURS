import {
  PATTERN_META,
  patternLabel,
  STATUS_META,
  type TrendPattern,
  type TrendStatus,
} from "@/lib/trend";

/*
 * ⚠️ 그린(#00C26A)은 **오르는 상태에만** 쓴다.
 *    유지·하락·데이터없음은 무채색 면이나 외곽선으로 처리한다 — 그린을 상태 배지 전체에
 *    돌리면 "그린 = 상승"이라는 약속이 깨지고 티어 밴드와 충돌한다.
 */
const STYLE: Record<
  TrendStatus,
  { fg: string; bg: string; border: string }
> = {
  surge: { fg: "#0B0B0A", bg: "#00C26A", border: "transparent" },
  up: { fg: "#0B0B0A", bg: "transparent", border: "#0B0B0A" },
  flat: { fg: "#5C5849", bg: "#E9E3D2", border: "transparent" },
  down: { fg: "#5C5849", bg: "transparent", border: "#C9C4B2" },
  none: { fg: "#6E6B62", bg: "transparent", border: "#C9C4B2" },
};

/** 마우스 hover 시 뜨는 설명 (전주 대비 상승률 기준). */
const DESC: Record<TrendStatus, string> = {
  surge: "급상승 · 전주 대비 +30% 이상 — 갑자기 확 뜨는 중",
  up: "상승 · 전주 대비 +5~30% — 꾸준히 오르는 중",
  flat: "유지 · 전주 대비 -5~+5% — 거의 변화 없음",
  down: "하락 · 전주 대비 -5% 이하 — 식는 중",
  none: "데이터 없음 · 상승률을 계산할 주간 데이터가 부족함",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: TrendStatus;
  size?: "sm" | "md";
}) {
  const s = STYLE[status];
  const dim = size === "md" ? "h-7 px-3 text-[12px]" : "h-[22px] px-2 text-[11.5px]";
  return (
    <span
      title={DESC[status]}
      className={`inline-flex cursor-help items-center whitespace-nowrap rounded-[3px] font-extrabold ${dim}`}
      style={{ color: s.fg, background: s.bg, border: `1.5px solid ${s.border}` }}
    >
      {STATUS_META[status].label}
    </span>
  );
}

const PATTERN_STYLE: Record<TrendPattern, string> = {
  streak_up: "text-rise-text",
  rebound: "text-ink-3",
  streak_down: "text-ink-3",
  mixed: "text-ink-4",
  none: "text-ink-4",
};

/** 4주 흐름 패턴 라벨 (뱃지 아래에 작게 표시). */
export function PatternTag({
  pattern,
  streak,
}: {
  pattern: TrendPattern;
  streak: number;
}) {
  if (pattern === "none") return null;
  return (
    <span
      title={PATTERN_META[pattern].desc}
      className={`cursor-help whitespace-nowrap text-[10.5px] font-semibold ${PATTERN_STYLE[pattern]}`}
    >
      {patternLabel(pattern, streak)}
    </span>
  );
}
