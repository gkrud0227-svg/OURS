import {
  PATTERN_META,
  patternLabel,
  STATUS_META,
  type TrendPattern,
  type TrendStatus,
} from "@/lib/trend";

const STYLE: Record<
  TrendStatus,
  { fg: string; bg: string; dot: string }
> = {
  surge: { fg: "#2f6a08", bg: "#e4f0cc", dot: "#4e8b10" },
  up: { fg: "#3e7a0c", bg: "#edf5e0", dot: "#5a9b12" },
  flat: { fg: "#6b675e", bg: "#f0eee9", dot: "#b4afa4" },
  down: { fg: "#b0512f", bg: "#f7ece6", dot: "#c86a45" },
  none: { fg: "#9c978c", bg: "#f0eee9", dot: "#c4bfb4" },
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
  const dim =
    size === "md" ? "h-7 gap-1.5 px-3 text-[12.5px]" : "h-6 gap-[5px] px-2.5 text-[11.5px]";
  return (
    <span
      title={DESC[status]}
      className={`inline-flex cursor-help items-center rounded-full font-bold ${dim}`}
      style={{ color: s.fg, background: s.bg }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: s.dot }}
      />
      {STATUS_META[status].label}
    </span>
  );
}

const PATTERN_STYLE: Record<TrendPattern, string> = {
  streak_up: "text-accent-ink",
  rebound: "text-[#b08910]",
  streak_down: "text-down",
  mixed: "text-muted",
  none: "text-muted",
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
