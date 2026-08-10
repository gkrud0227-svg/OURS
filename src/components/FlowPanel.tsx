"use client";

import type { ReasonResult } from "@/lib/types";
import { MIN_DOC_HITS } from "@/lib/reasons";

/**
 * "SNS 확산 흐름" — 개별 신상 제품이 아니라, 국내 발굴 텍스트(유튜브 영상 제목) 전체에서
 * **어떤 이유(맛·식감·희소성·비주얼·계절)로 퍼지는지**의 큰 흐름을 집계해 보여준다.
 *
 * 랭킹이 "무엇이 뜨나(제품)"라면, 이 패널은 "어느 방향으로 흐르나(테마)"를 답한다.
 */
export function FlowPanel({ flow }: { flow: ReasonResult | null }) {
  const shell = (body: React.ReactNode) => (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-strong">
          SNS 확산 흐름 <span className="font-normal text-muted">(테마별 확산 이유)</span>
        </h2>
        {flow && flow.docCount > 0 && (
          <span className="text-xs text-muted">발굴 영상 제목 {flow.docCount}건 집계</span>
        )}
      </div>
      {body}
    </section>
  );

  if (!flow || flow.docCount === 0) {
    return shell(
      <p className="py-6 text-center text-sm text-muted">
        키워드 발굴을 실행하면, 발굴된 영상 제목 전체에서 <b className="font-semibold">확산 이유(테마)</b>
        의 흐름을 집계합니다.
      </p>,
    );
  }

  const active = flow.categories.filter((c) => c.docHits > 0);
  if (!active.length) {
    return shell(
      <p className="py-6 text-center text-sm text-muted">
        영상 제목 {flow.docCount}건에서 뚜렷한 확산 이유 신호가 잡히지 않았습니다. 시드를 바꿔
        발굴하면 흐름이 드러날 수 있어요.
      </p>,
    );
  }

  const top = active[0];
  const topPct = Math.round(top.share * 100);
  const thin = top.docHits < MIN_DOC_HITS;

  return shell(
    <>
      <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
        지금 국내 SNS는 <b className="text-sm font-bold">{top.label}</b> 중심으로 흐릅니다{" "}
        <span className="font-semibold">
          — 영상 {top.docHits}건 ({topPct}%)에서 언급
        </span>
        {top.topWords.length > 0 && (
          <span className="text-muted-strong"> · “{top.topWords.join(", ")}”</span>
        )}
        {thin && <span className="ml-1 text-muted">· 표본이 얇어 참고용</span>}
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
                    background: i === 0 ? "linear-gradient(90deg,#82bc00,#4e8b10)" : "#c9dfa3",
                  }}
                />
              </div>
              <span
                className="w-20 shrink-0 text-right text-[13px] font-bold tabular-nums"
                title={`${c.docHits}건 언급 / 전체 ${flow.docCount}건`}
              >
                {c.docHits}건 · {pct}%
              </span>
              <span className="hidden w-44 shrink-0 truncate text-xs text-muted sm:block">
                {c.topWords.join(", ")}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        개별 신상이 아니라 <b className="font-semibold">발굴된 영상 전체가 어떤 이유로 퍼지는지</b>의
        비중입니다(언급 영상 수 ÷ 전체). 오른쪽 단어가 그 흐름을 만든 실제 표현이에요. 최소{" "}
        {MIN_DOC_HITS}건 이상이면 신호로 봅니다.
      </p>
    </>,
  );
}
