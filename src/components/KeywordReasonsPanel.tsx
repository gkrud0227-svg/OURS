"use client";

import type { KeywordReason } from "@/lib/types";
import { MIN_DOC_HITS } from "@/lib/reasons";

/** 한 키워드당 최대 몇 개 이유를 보여줄지 / 패널에 몇 개 키워드를 올릴지. */
const CATS_PER_KEYWORD = 3;
const MAX_KEYWORDS = 8;

/**
 * "키워드별 확산 이유" — 검색검증된 상위 제품 후보마다, 그 제품의 **인기 영상(조회수순)
 * 시청자 댓글**을 모아 왜 퍼지는지(맛·식감·계절·비주얼·희소성)를 따로 보여준다.
 *
 * 전체 합산이 아니라 제품 귀속이라, "두바이초콜릿은 식감으로, 소금빵은 계절로"처럼
 * 제품별 확산 이유를 읽을 수 있다. 그래도 표본이 얇으면 "근거 부족"으로 정직하게 표시한다.
 */
export function KeywordReasonsPanel({
  keywordReasons,
  loadingTerm,
}: {
  keywordReasons: KeywordReason[] | null;
  loadingTerm?: string | null;
}) {
  const shell = (body: React.ReactNode) => (
    <section id="reason-panel" className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-strong">
          키워드별 확산 이유 <span className="font-normal text-muted">(시청자 댓글 기준)</span>
        </h2>
        <span className="text-xs text-muted">표에서 키워드를 눌러 이유를 볼 수 있어요</span>
      </div>
      {body}
    </section>
  );

  const loadingBanner = loadingTerm ? (
    <div className="mb-3 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-accent-ink">
      <b className="font-bold">{loadingTerm}</b> 확산 이유를 인기 영상 댓글에서 집계 중…
    </div>
  ) : null;

  const rows = (keywordReasons ?? []).slice(0, MAX_KEYWORDS);

  if (!rows.length) {
    return shell(
      <>
        {loadingBanner}
        {!loadingTerm && (
          <p className="py-6 text-center text-sm text-muted">
            키워드 발굴을 실행하면 상위 제품의 이유가 뜨고, 아래{" "}
            <b className="font-semibold">발굴 후보 표에서 키워드를 누르면</b> 그 제품의 인기 영상
            댓글에서 <b className="font-semibold">왜 퍼지는지</b>를 집계합니다.
          </p>
        )}
      </>,
    );
  }

  return shell(
    <>
      {loadingBanner}
      <div className="space-y-3.5">
        {rows.map((k) => {
          const active = k.reasons.categories.filter((c) => c.docHits > 0).slice(0, CATS_PER_KEYWORD);
          const top = active[0];
          const thin = !top || top.docHits < MIN_DOC_HITS;
          const maxHits = Math.max(...active.map((c) => c.docHits), 1);
          return (
            <div key={k.term} className="rounded-xl border border-line bg-[#fbfaf7] px-3.5 py-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-bold text-accent-ink">{k.term}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  댓글 {k.commentCount.toLocaleString()}개 · 영상 {k.videoCount}개
                </span>
              </div>

              {k.commentCount === 0 ? (
                <p className="text-xs text-muted">
                  이 키워드의 인기 영상 댓글을 찾지 못했어요 (댓글이 적거나 꺼진 영상)
                </p>
              ) : !active.length ? (
                <p className="text-xs text-muted">뚜렷한 이유 신호가 없어요 (댓글 표본이 얇음)</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {active.map((c, i) => {
                      const pct = Math.round(c.share * 100);
                      const w = Math.round((c.docHits / maxHits) * 100);
                      return (
                        <div key={c.key} className="flex items-center gap-2.5">
                          <span className="w-[74px] shrink-0 text-xs font-semibold">{c.label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceae4]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(w, 5)}%`,
                                background:
                                  i === 0 ? "linear-gradient(90deg,#82bc00,#4e8b10)" : "#c9dfa3",
                              }}
                            />
                          </div>
                          <span className="w-16 shrink-0 text-right text-[11.5px] font-bold tabular-nums">
                            {c.docHits}개 · {pct}%
                          </span>
                          <span className="hidden w-36 shrink-0 truncate text-[11px] text-muted sm:block">
                            {c.topWords.join(", ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {thin && (
                    <p className="mt-1.5 text-[11px] text-muted">
                      · 표본이 얇아 참고용 (최소 {MIN_DOC_HITS}개 언급이면 신호로 봅니다)
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        각 제품의 <b className="font-semibold">인기 영상(조회수순) 시청자 댓글</b>에서 이유어를 집계했습니다
        (언급 댓글 수 ÷ 그 제품 댓글). 표본이 얇으면 참고용으로 표시합니다.
        “맛”은 일반 칭찬어가 섞여 크게 잡히는 경향이 있습니다.
      </p>
    </>,
  );
}
