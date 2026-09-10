"use client";

import { useState } from "react";
import { Badge, StatusChip, rowClass } from "@/components/DemoTable";
import {
  DEMO_MIN_DOC_HITS,
  DEMO_REASONS,
  type DemoDomesticRow,
} from "@/lib/demo-data";
import { formatCount } from "@/lib/format";

/**
 * 체험용 국내 랭킹의 행 묶음.
 *
 * 키워드를 누르면 그 아래로 **확산 이유**가 펼쳐진다. 실제 화면에서는 이 집계가
 * 유튜브 쿼터를 쓰는 버튼(확산이유 ▸)이라 체험에서는 미리 받아둔 값을 읽기만 한다.
 *
 * ⚠️ 한 번에 하나만 펼친다. 여러 개를 동시에 열면 휴대폰에서 표가 세로로 끝없이
 *    늘어나 순위를 훑는다는 본래 목적이 사라진다.
 */
const GRID =
  "lg:grid lg:grid-cols-[44px_120px_1fr_100px_120px_140px] lg:items-center lg:gap-3 px-4";

export function DomesticRows({
  rows,
  maxScore,
}: {
  rows: DemoDomesticRow[];
  maxScore: number;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      {rows.map((r) => {
        const big = r.tier === 1;
        const expanded = open === r.name;
        const reason = DEMO_REASONS[r.name];
        return (
          <div key={r.name}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : r.name)}
              aria-expanded={expanded}
              className={`${GRID} ${rowClass(r.tier)} cb-row-hover w-full text-left ${
                expanded ? "!bg-mutedbg" : big ? "hover:bg-row2" : "hover:bg-mutedbg"
              }`}
            >
              <div className="mb-1 flex items-baseline gap-3 lg:mb-0 lg:contents">
                <span
                  className={`cb-num ${
                    big ? "text-[16px] text-ink" : "text-[14px] !font-extrabold text-ink-3"
                  }`}
                >
                  {String(r.rank).padStart(2, "0")}
                </span>
                <span
                  className={`cb-num whitespace-nowrap text-ink ${
                    big ? "text-[24px] tracking-[-0.04em]" : "text-[18px] tracking-[-0.03em]"
                  }`}
                >
                  +{r.riseRate.toFixed(1)}%
                </span>
              </div>

              <div className="min-w-0">
                <span
                  className={
                    big
                      ? "text-[19px] font-black tracking-[-0.02em] underline decoration-chip decoration-2 underline-offset-4"
                      : "text-[15.5px] font-extrabold underline decoration-chip decoration-2 underline-offset-4"
                  }
                >
                  {r.name}
                </span>
                {r.badges.map((b) => (
                  <Badge key={b} kind={b} />
                ))}
                <span className="ml-2 whitespace-nowrap text-[11px] font-bold text-ink-4">
                  {expanded ? "이유 닫기 ▴" : "확산이유 ▾"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:mt-0 lg:contents">
                <span className="text-[11px] text-ink-4 lg:hidden">월 검색량</span>
                <span
                  className={`cb-num text-ink lg:text-right ${big ? "text-[15px]" : "text-[13px]"}`}
                >
                  {r.volume > 0 ? formatCount(r.volume) : "—"}
                </span>
                <div className="flex items-center gap-1.5 lg:flex-col lg:items-start lg:gap-1">
                  <StatusChip status={r.status} />
                  <span
                    className={`whitespace-nowrap text-[10.5px] font-semibold ${
                      r.patternUp ? "text-rise-text" : "text-ink-3"
                    }`}
                  >
                    {r.pattern}
                  </span>
                </div>
                <div className="flex w-full items-center gap-2.5 lg:w-auto">
                  <span className="text-[11px] text-ink-4 lg:hidden">발굴점수</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
                    <div
                      className="h-full rounded-[3px] bg-rise"
                      style={{ width: `${Math.round((r.score / maxScore) * 100)}%` }}
                    />
                  </div>
                  <span
                    className={`cb-num min-w-[24px] text-right ${big ? "text-[17px]" : "text-[15px]"}`}
                  >
                    {r.score}
                  </span>
                </div>
              </div>
            </button>

            {expanded && <ReasonPanel term={r.name} reason={reason} />}
          </div>
        );
      })}
    </>
  );
}

/** 확산 이유 — 그 키워드가 나온 인기 영상의 시청자 댓글을 사전으로 집계한 분포. */
function ReasonPanel({
  term,
  reason,
}: {
  term: string;
  reason: (typeof DEMO_REASONS)[string] | undefined;
}) {
  if (!reason) return null;
  const cats = reason.categories;
  const maxHits = Math.max(...cats.map((c) => c.docHits), 1);
  const thin = !cats.length || cats[0].docHits < DEMO_MIN_DOC_HITS;

  return (
    <div className="border-b-[1.5px] border-ink bg-band3 px-4 py-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">
          {term} <span className="font-medium text-ink-3">확산 이유</span>
          {reason.dominant && (
            <span className="ml-2 rounded-[3px] bg-rise px-2 py-[2px] text-[11px] font-extrabold text-ink">
              {reason.dominant}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-ink-4">
          댓글 {reason.comments.toLocaleString()}개 · 영상 {reason.videos}개
        </span>
      </div>

      {!cats.length ? (
        <p className="text-[12px] text-ink-3">
          뚜렷한 이유 신호가 없어요 (댓글 표본이 얇음). 이유를 못 찾은 것이지 이유가 없다는
          뜻은 아닙니다.
        </p>
      ) : (
        <div className="space-y-1.5">
          {cats.map((c) => (
            <div key={c.label} className="flex items-center gap-2.5">
              <span className="w-[74px] shrink-0 text-[11.5px] font-bold text-ink">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
                <div
                  className="h-full rounded-[3px] bg-rise"
                  style={{ width: `${Math.max(Math.round((c.docHits / maxHits) * 100), 5)}%` }}
                />
              </div>
              <span className="cb-num w-16 shrink-0 text-right text-[12px] text-ink">
                {c.docHits}개 · {c.sharePct}%
              </span>
              <span className="hidden w-40 shrink-0 truncate text-[11px] text-ink-4 sm:block">
                {c.words.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {cats.length > 0 && thin && (
        <p className="mt-1.5 text-[11px] text-ink-4">
          · 표본이 얇아 참고용 (최소 {DEMO_MIN_DOC_HITS}개 언급이면 신호로 봅니다)
        </p>
      )}
    </div>
  );
}
