"use client";

import type { Keyword } from "@/lib/types";
import { MIN_DOC_HITS } from "@/lib/reasons";

export function ReasonTags({ keyword }: { keyword: Keyword }) {
  const r = keyword.youtube?.reasons;

  const hint = (text: string) => (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-muted-strong">
        이유 태그 <span className="font-normal text-muted">(확산 이유 추정)</span>
      </h2>
      <p className="py-6 text-center text-sm text-muted">{text}</p>
    </section>
  );

  if (!keyword.youtube) {
    return hint(
      "위의 “YouTube 신호 수집”을 먼저 실행하면, 영상 제목·설명에서 확산 이유를 추정합니다.",
    );
  }
  if (!r || typeof r.confident !== "boolean") {
    return hint(
      "YouTube를 “다시 수집”하면 개선된 확산 이유 분석이 표시됩니다. (기존 수집 데이터는 이전 방식)",
    );
  }

  const top = r.categories[0];

  if (!r.confident) {
    return hint(
      `이유 신호가 부족합니다. 영상 ${r.docCount}건 중 가장 많이 언급된 카테고리도 ${
        top?.docHits ?? 0
      }건뿐입니다. (최소 ${MIN_DOC_HITS}건 필요)`,
    );
  }

  const active = r.categories.filter((c) => c.docHits > 0);
  const topPct = Math.round(top.share * 100);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-strong">
          이유 태그 <span className="font-normal text-muted">(확산 이유 추정)</span>
        </h2>
        <span className="text-xs text-muted">
          {r.igDocCount
            ? `YouTube ${r.ytDocCount}건 + Instagram 캡션 ${r.igDocCount}건 = ${r.docCount}건 기준`
            : `YouTube 제목·설명 ${r.docCount}건 기준`}
        </span>
      </div>

      <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
        주요 확산 이유: <b className="text-sm font-bold">{top.label}</b>{" "}
        <span className="font-semibold">
          — 영상 {top.docHits}건 ({topPct}%)에서 언급
        </span>
        {top.topWords.length > 0 && (
          <span className="text-muted-strong"> · “{top.topWords.join(", ")}”</span>
        )}
      </div>

      <div className="space-y-2.5">
        {active.map((c, i) => {
          const pct = Math.round(c.share * 100);
          return (
            <div key={c.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[13px] font-semibold">{c.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0eee9]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(pct, 3)}%`,
                    background:
                      i === 0 ? "linear-gradient(90deg,#82bc00,#4e8b10)" : "#c9dfa3",
                  }}
                />
              </div>
              <span
                className="w-20 shrink-0 text-right text-[13px] font-bold tabular-nums"
                title={`${c.docHits}건 언급 / 전체 ${r.docCount}건`}
              >
                {c.docHits}건 · {pct}%
              </span>
              <span className="hidden w-40 shrink-0 truncate text-xs text-muted sm:block">
                {c.topWords.join(", ")}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        비중은 <b className="font-semibold">해당 단어를 언급한 게시물 수 ÷ 전체 게시물 수</b>
        입니다. 최소 {MIN_DOC_HITS}건 이상 언급돼야 “주요 이유”로 인정합니다.
        {r.igDocCount
          ? " Instagram 캡션(소비자 언어)이 합산되어 있습니다."
          : " /instagram 에서 캡션을 수집하면 정확도가 올라갑니다."}
      </p>
    </section>
  );
}
