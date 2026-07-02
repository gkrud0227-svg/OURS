"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store-context";
import type { ScoreKey } from "@/lib/types";
import {
  GO_THRESHOLD,
  SCORE_MAX,
  SCORE_META,
  SCORE_TOTAL_MAX,
  totalScore,
  verdict,
  type VerdictKey,
} from "@/lib/trend";
import { formatDateTime } from "@/lib/format";

const INITIAL: Record<ScoreKey, number> = {
  trendSignal: 10,
  scarcity: 10,
  vendingFit: 10,
  sourcing: 10,
  priceFit: 10,
};

const VERDICT_STYLE: Record<VerdictKey, string> = {
  go: "bg-accent text-white",
  improve: "bg-amber-100 text-amber-700",
  next: "bg-neutral-100 text-neutral-500",
};

export function ScorecardClient() {
  const searchParams = useSearchParams();
  const keywordIdParam = searchParams.get("keywordId");
  const {
    hydrated,
    keywords,
    scorecards,
    addScorecard,
    deleteScorecard,
  } = useStore();

  const [productName, setProductName] = useState("");
  const [scores, setScores] = useState<Record<ScoreKey, number>>(INITIAL);
  const [prefilled, setPrefilled] = useState(false);

  // 키워드 상세에서 넘어온 경우 제품명을 미리 채운다(최초 1회).
  useEffect(() => {
    if (!hydrated || prefilled) return;
    if (keywordIdParam) {
      const kw = keywords.find((k) => k.id === keywordIdParam);
      if (kw) setProductName(kw.name);
    }
    setPrefilled(true);
  }, [hydrated, prefilled, keywordIdParam, keywords]);

  const total = useMemo(() => totalScore(scores), [scores]);
  const v = verdict(total);

  function setScore(key: ScoreKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    const name = productName.trim();
    if (!name) return;
    addScorecard({
      productName: name,
      keywordId: keywordIdParam,
      scores,
    });
    // 다음 입력을 위해 초기화
    setProductName("");
    setScores(INITIAL);
    setPrefilled(true);
  }

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">제품 후보 스코어카드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          5가지 기준을 각 {SCORE_MAX}점으로 평가합니다. 총점 {GO_THRESHOLD}점
          이상이면 “즉시 진행” 후보입니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 입력 */}
        <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              제품명
            </label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 흑임자 크림 크루아상"
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-4">
            {SCORE_META.map((m) => (
              <div key={m.key}>
                <div className="flex items-baseline justify-between">
                  <label className="text-sm font-medium text-neutral-700">
                    {m.label}
                    <span className="ml-2 text-xs font-normal text-neutral-400">
                      {m.hint}
                    </span>
                  </label>
                  <span className="text-sm font-semibold tabular-nums text-accent-ink">
                    {scores[m.key]}
                    <span className="text-xs text-neutral-400"> / {SCORE_MAX}</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={SCORE_MAX}
                  step={1}
                  value={scores[m.key]}
                  onChange={(e) => setScore(m.key, Number(e.target.value))}
                  className="accent-range mt-2 w-full"
                />
              </div>
            ))}
          </div>

          <button
            onClick={onSave}
            disabled={!productName.trim()}
            className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            스코어카드 저장
          </button>
        </section>

        {/* 결과 요약 */}
        <section className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-sm text-neutral-500">총점</p>
            <p className="mt-1 text-5xl font-semibold tabular-nums">
              {total}
              <span className="text-lg text-neutral-300"> / {SCORE_TOTAL_MAX}</span>
            </p>
            <div
              className={`mt-4 inline-flex rounded-full px-4 py-1.5 text-sm font-medium ${VERDICT_STYLE[v.key]}`}
            >
              {v.label}
            </div>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${(total / SCORE_TOTAL_MAX) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              80점↑ 즉시 진행 · 60–79점 조건 개선 · 60점↓ 다음 후보
            </p>
          </div>
        </section>
      </div>

      {/* 저장된 스코어카드 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">저장된 스코어카드</h2>
        {scorecards.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-400">
            아직 저장된 스코어카드가 없습니다.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {scorecards.map((sc) => {
              const scTotal = totalScore(sc.scores);
              const scV = verdict(scTotal);
              return (
                <li
                  key={sc.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{sc.productName}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {formatDateTime(sc.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteScorecard(sc.id)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-500"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-2xl font-semibold tabular-nums">
                      {scTotal}
                      <span className="text-sm text-neutral-300"> / 100</span>
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${VERDICT_STYLE[scV.key]}`}
                    >
                      {scV.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
