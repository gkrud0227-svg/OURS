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
 *
 * ⚠️ 휴대폰과 넓은 화면의 배치를 **따로 그린다**(하나를 반응형으로 접지 않는다).
 *    두 화면의 짜임이 다르기 때문이다. 넓은 화면은 실제 대시보드와 같은 한 줄 격자
 *    (`순위 → 키워드 → 상승률 → …`)지만, 휴대폰에서는 그걸 접어도 순위가 안 읽힌다
 *    (실사용 피드백). 휴대폰은 순위를 **왼쪽 거터**로 빼서 01·02·03… 이 세로로
 *    정렬되게 하고, 키워드를 첫 줄에 단독으로 올린다.
 * ⚠️ 두 배치 모두 **키워드가 수치보다 크다**. 이 표에서 먼저 읽혀야 하는 건
 *    "무엇이" 뜨는가지 "얼마나" 가 아니다.
 */
const DESKTOP_GRID =
  "hidden lg:grid lg:grid-cols-[44px_1fr_120px_100px_120px_140px] lg:items-center lg:gap-3";

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
        const expanded = open === r.name;
        return (
          <div key={r.name}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : r.name)}
              aria-expanded={expanded}
              className={`cb-row-hover w-full px-4 text-left ${rowClass(r.tier)} ${
                expanded ? "!bg-mutedbg" : r.tier === 1 ? "hover:bg-row2" : "hover:bg-mutedbg"
              }`}
            >
              <MobileRow r={r} maxScore={maxScore} expanded={expanded} />
              <DesktopRow r={r} maxScore={maxScore} expanded={expanded} />
            </button>

            {expanded && <ReasonPanel term={r.name} reason={DEMO_REASONS[r.name]} />}
          </div>
        );
      })}
    </>
  );
}

/**
 * 휴대폰 배치 — 왼쪽 38px 거터에 순위, 오른쪽에 내용.
 * 거터 덕분에 01·02·03… 이 세로로 정렬돼 훑을 때 순위가 먼저 읽힌다.
 */
function MobileRow({
  r,
  maxScore,
  expanded,
}: {
  r: DemoDomesticRow;
  maxScore: number;
  expanded: boolean;
}) {
  const big = r.tier === 1;
  return (
    <div className="grid grid-cols-[38px_1fr] gap-x-3 lg:hidden">
      <span
        className={`cb-num self-start leading-none ${
          big ? "text-[24px] text-ink" : "text-[20px] text-ink-3"
        }`}
      >
        {String(r.rank).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div>
          <span
            className={`${
              big ? "text-[20px] font-black tracking-[-0.02em]" : "text-[16.5px] font-extrabold"
            } underline decoration-chip decoration-2 underline-offset-4`}
          >
            {r.name}
          </span>
          {r.badges.map((b) => (
            <Badge key={b} kind={b} />
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="cb-num text-[17px] leading-none tracking-[-0.03em] text-ink">
            +{r.riseRate.toFixed(1)}%
          </span>
          <StatusChip status={r.status} />
          <span
            className={`whitespace-nowrap text-[10.5px] font-semibold ${
              r.patternUp ? "text-rise-text" : "text-ink-3"
            }`}
          >
            {r.pattern}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2.5">
          <span className="whitespace-nowrap text-[11px] text-ink-4">
            검색 <span className="cb-num text-[12px] text-ink">
              {r.volume > 0 ? formatCount(r.volume) : "—"}
            </span>
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
            <div
              className="h-full rounded-[3px] bg-rise"
              style={{ width: `${Math.round((r.score / maxScore) * 100)}%` }}
            />
          </div>
          <span className="cb-num min-w-[22px] text-right text-[15px]">{r.score}</span>
          <span className="whitespace-nowrap text-[11px] font-bold text-ink-4">
            {expanded ? "이유 ▴" : "이유 ▾"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 넓은 화면 배치 — 실제 대시보드와 같은 열 순서(순위 → 키워드 → 상승률 → …). */
function DesktopRow({
  r,
  maxScore,
  expanded,
}: {
  r: DemoDomesticRow;
  maxScore: number;
  expanded: boolean;
}) {
  const big = r.tier === 1;
  return (
    <div className={DESKTOP_GRID}>
      <span
        className={`cb-num ${big ? "text-[16px] text-ink" : "text-[14px] !font-extrabold text-ink-3"}`}
      >
        {String(r.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <span
          className={`${
            big ? "text-[21px] font-black tracking-[-0.02em]" : "text-[16px] font-extrabold"
          } underline decoration-chip decoration-2 underline-offset-4`}
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
      <span
        className={`cb-num whitespace-nowrap text-ink ${
          big ? "text-[20px] tracking-[-0.03em]" : "text-[16px] tracking-[-0.02em]"
        }`}
      >
        +{r.riseRate.toFixed(1)}%
      </span>
      <span className={`cb-num text-right text-ink ${big ? "text-[15px]" : "text-[13px]"}`}>
        {r.volume > 0 ? formatCount(r.volume) : "—"}
      </span>
      <div className="flex flex-col items-start gap-1">
        <StatusChip status={r.status} />
        <span
          className={`whitespace-nowrap text-[10.5px] font-semibold ${
            r.patternUp ? "text-rise-text" : "text-ink-3"
          }`}
        >
          {r.pattern}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
          <div
            className="h-full rounded-[3px] bg-rise"
            style={{ width: `${Math.round((r.score / maxScore) * 100)}%` }}
          />
        </div>
        <span className={`cb-num min-w-[24px] text-right ${big ? "text-[17px]" : "text-[15px]"}`}>
          {r.score}
        </span>
      </div>
    </div>
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
