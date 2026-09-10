import type { DemoBadge, DemoTier } from "@/lib/demo-data";

/**
 * 체험 화면 공용 표 조각.
 * 실제 대시보드와 **같은 규격**을 쓴다 — 티어 밴드, 잉크 표 헤더, Archivo 수치.
 * 실제 화면 컴포넌트를 재사용하지 않는 이유: 그쪽은 store(발굴·저장·시드)에 묶여 있고,
 * 체험 화면은 읽기 전용이어야 해서 store 를 아예 안 붙인다.
 */

/** 배지 스타일 — 그린은 상승·통과·완료에만. 출처는 무채색, 두 소스 교차는 잉크 면. */
const BADGE_CLS: Record<DemoBadge, string> = {
  트렌드: "bg-rise text-ink",
  "신규 검색어": "bg-mutedbg text-ink-3",
  "구매↑": "bg-rise text-ink",
  상승세: "border border-ink text-ink",
  "유튜브+검색": "bg-ink text-on-dark",
  유튜브: "bg-mutedbg text-ink-3",
  검색: "border border-chip text-ink-2",
};

export function Badge({ kind }: { kind: DemoBadge }) {
  return (
    <span
      className={`ml-1.5 rounded-[3px] px-2 py-[2px] text-[10.5px] font-extrabold ${BADGE_CLS[kind]}`}
    >
      {kind === "구매↑" ? "구매 ↑" : kind}
    </span>
  );
}

export function TierBand({
  tier,
  label,
  note,
}: {
  tier: DemoTier;
  label: string;
  note: string;
}) {
  return (
    <div
      className={`flex items-center gap-[9px] border-b-[1.5px] border-ink px-4 py-[7px] ${
        tier === 1 ? "bg-rise" : "bg-mutedbg"
      }`}
    >
      <span className="cb-tier text-ink">{label}</span>
      <span
        className={`text-[12px] font-semibold ${tier === 1 ? "text-rise-ink" : "text-ink-3"}`}
      >
        {note}
      </span>
    </div>
  );
}

/** 티어에 따라 배경 밝기·여백·괘선 굵기가 함께 움직인다. */
export function rowClass(tier: DemoTier): string {
  return tier === 1
    ? "border-b-[1.5px] border-ink bg-row1 py-[15px]"
    : "border-b border-hair bg-row2 py-[11px]";
}

/** 상태 배지 — 급상승만 그린 면, 상승은 잉크 외곽선. */
export function StatusChip({ status }: { status: "급상승" | "상승" }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-[3px] px-2 text-[11.5px] font-extrabold ${
        status === "급상승"
          ? "border-[1.5px] border-transparent bg-rise text-ink"
          : "border-[1.5px] border-ink text-ink"
      }`}
    >
      {status}
    </span>
  );
}
