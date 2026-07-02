import { STATUS_META, type TrendStatus } from "@/lib/trend";

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
      className={`inline-flex items-center rounded-full font-bold ${dim}`}
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
