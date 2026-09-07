"use client";

import type { CoFlowResult } from "@/lib/types";

/**
 * "SNS 확산 흐름" — 발굴된 유튜브 영상 제목·설명에서 **실제로 함께 등장한 구체 키워드**를
 * 언급 영상 수 순으로 보여준다.
 *
 * 이전엔 5개 이유 태그(맛·식감·계절·비주얼·희소성)로 분류했지만, 영상 제목 어휘가 그 사전과
 * 안 맞아 대부분 0건으로 잡혀 "흐름이 하나도 안 보이는" 문제가 있었다. 그래서 추상 태그 대신
 * **지금 영상에서 같이 퍼지는 실제 단어**를 그대로 노출한다.
 *
 * 랭킹 표가 "무엇이 뜨나(검색 검증된 후보)"라면, 이 패널은 "지금 무엇이 함께 퍼지나(언급 규모)"다.
 */
export function FlowPanel({ flow }: { flow: CoFlowResult | null }) {
  const shell = (body: React.ReactNode) => (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-strong">
          SNS 확산 흐름 <span className="font-normal text-muted">(지금 함께 퍼지는 말)</span>
        </h2>
        {flow && flow.videoCount > 0 && (
          <span className="text-xs text-muted">발굴 영상 {flow.videoCount}건 기준</span>
        )}
      </div>
      {body}
    </section>
  );

  if (!flow || !flow.terms.length) {
    return shell(
      <p className="py-6 text-center text-sm text-muted">
        키워드 발굴을 실행하면, 발굴된 영상에서 <b className="font-semibold">실제로 함께 등장한 단어</b>
        를 언급 영상 수 순으로 모아 보여줍니다.
      </p>,
    );
  }

  const top = flow.terms[0];
  const maxVideos = Math.max(...flow.terms.map((t) => t.videos), 1);

  return shell(
    <>
      <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
        지금 국내 SNS엔 <b className="text-sm font-bold">{top.term}</b>이(가) 가장 넓게 퍼집니다{" "}
        <span className="font-semibold">
          — 영상 {top.videos}건 · 채널 {top.channels}개
        </span>
        {top.novel && <span className="ml-1 font-semibold text-accent">· 신규 등장</span>}
        {top.lift >= 2 && <span className="ml-1 text-muted-strong">· 급증 ×{top.lift}</span>}
      </div>

      <div className="space-y-2.5">
        {flow.terms.map((t, i) => {
          const pct = Math.round((t.videos / maxVideos) * 100);
          return (
            <div key={t.term} className="flex items-center gap-3">
              <span className="flex w-28 shrink-0 items-center gap-1 text-[13px] font-semibold">
                <span className="truncate" title={t.term}>
                  {t.term}
                </span>
                {t.novel && (
                  <span
                    title="과거 표본엔 없다가 최근 처음 등장한 단어"
                    className="shrink-0 rounded-full bg-accent-soft px-1.5 py-[1px] text-[9.5px] font-bold text-accent"
                  >
                    신규
                  </span>
                )}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0eee9]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(pct, 4)}%`,
                    background: i === 0 ? "linear-gradient(90deg,#82bc00,#4e8b10)" : "#c9dfa3",
                  }}
                />
              </div>
              <span
                className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums"
                title={`영상 ${t.videos}건 · 채널 ${t.channels}개`}
              >
                {t.videos}건 · {t.channels}채널
              </span>
              <span className="hidden w-16 shrink-0 text-right text-xs text-muted sm:block">
                {t.lift >= 2 ? `×${t.lift}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        추상 이유 태그가 아니라 <b className="font-semibold">발굴 영상에서 실제로 함께 등장한 단어</b>를
        언급 영상 수 순으로 나열했습니다. <b className="font-semibold">채널</b> 수가 클수록 여러 창작자에게
        번진 것이고, <b className="font-semibold">×배수</b>는 과거 대비 급증 정도입니다. 아래 표는 이 중
        검색까지 검증된 후보를 따로 추립니다.
      </p>
    </>,
  );
}
