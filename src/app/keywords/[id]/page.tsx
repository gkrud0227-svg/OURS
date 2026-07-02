"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { computeTrend, lastWeeks } from "@/lib/trend";
import { formatCount, formatDateTime, formatPct, pctColor } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { TrendChart } from "@/components/TrendChart";
import { SocialPanels } from "@/components/SocialPanels";

export default function KeywordDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { hydrated, keywords, setTiktok, refreshOne, refreshing } = useStore();

  const keyword = keywords.find((k) => k.id === id);

  const [tiktokInput, setTiktokInput] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (keyword) setTiktokInput(keyword.tiktok?.toString() ?? "");
  }, [keyword]);

  const weeks = useMemo(
    () => (keyword ? lastWeeks(keyword.weeks, 4) : []),
    [keyword],
  );

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />;
  }

  if (!keyword) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-500">키워드를 찾을 수 없습니다.</p>
        <Link href="/" className="text-sm text-accent-ink hover:underline">
          ← 대시보드로 돌아가기
        </Link>
      </div>
    );
  }

  const t = computeTrend(keyword);

  function saveTiktok() {
    const trimmed = tiktokInput.trim();
    if (trimmed === "") {
      setTiktok(keyword!.id, null);
      setMessage({ kind: "ok", text: "틱톡 언급량을 비웠습니다." });
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setMessage({ kind: "error", text: "0 이상의 숫자를 입력하세요." });
      return;
    }
    setTiktok(keyword!.id, Math.round(n));
    setMessage({ kind: "ok", text: "틱톡 언급량을 저장했습니다." });
  }

  async function onRefresh() {
    setMessage(null);
    const r = await refreshOne(keyword!.id);
    setMessage(
      r.error
        ? { kind: "error", text: r.error }
        : { kind: "ok", text: "실데이터로 갱신했습니다." },
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-600">
        ← 대시보드
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {keyword.name}
            </h1>
            <StatusBadge status={t.status} size="md" />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {keyword.category} · 전주 대비{" "}
            <span className={`font-medium ${pctColor(t.riseRate)}`}>
              {formatPct(t.riseRate)}
            </span>
            {keyword.volumeTotal != null && (
              <> · 월 검색량 {formatCount(keyword.volumeTotal)}</>
            )}
            {" · "}
            {keyword.source === "datalab" ? "실데이터" : "샘플"} ·{" "}
            {formatDateTime(keyword.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {refreshing ? "갱신 중…" : "이 키워드 갱신"}
          </button>
          <Link
            href={`/scorecard?keywordId=${keyword.id}`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            스코어카드 만들기
          </Link>
        </div>
      </header>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            message.kind === "error"
              ? "bg-red-50 text-red-600"
              : "bg-accent-soft text-accent-ink"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 차트 */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">
          최근 4주 검색 트렌드 (상대 검색지수)
        </h2>
        {weeks.length ? (
          <TrendChart data={weeks} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-400">
            트렌드 데이터가 없습니다. 위의 “이 키워드 갱신”을 눌러보세요.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 주차별 수치 */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-500">
            주차별 검색지수
          </h2>
          {weeks.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-400">
                <tr>
                  <th className="pb-2 font-medium">주 시작일</th>
                  <th className="pb-2 text-right font-medium">검색지수</th>
                  <th className="pb-2 text-right font-medium">전주 대비</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {weeks.map((w, i) => {
                  const prev = i > 0 ? weeks[i - 1].ratio : null;
                  const wow =
                    prev === null
                      ? null
                      : prev === 0
                        ? w.ratio > 0
                          ? 100
                          : 0
                        : ((w.ratio - prev) / prev) * 100;
                  return (
                    <tr key={w.period}>
                      <td className="py-2 text-neutral-600">{w.period}</td>
                      <td className="py-2 text-right tabular-nums">{w.ratio}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${pctColor(wow)}`}
                      >
                        {formatPct(wow)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-neutral-400">데이터 없음</p>
          )}
        </section>

        {/* 틱톡 언급량 수동 입력 */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-medium text-neutral-500">
            틱톡 언급량 (수동 입력)
          </h2>
          <p className="mb-3 text-xs text-neutral-400">
            틱톡은 공개 API 제한으로 자동 수집이 어렵습니다. 주간 언급량을 직접
            입력해 참고 지표로 활용하세요.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={tiktokInput}
              onChange={(e) => setTiktokInput(e.target.value)}
              placeholder="예: 1200"
              className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={saveTiktok}
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              저장
            </button>
          </div>
          <p className="mt-3 text-sm text-neutral-500">
            현재 저장값:{" "}
            <span className="font-medium text-neutral-800">
              {keyword.tiktok === null
                ? "없음"
                : `${keyword.tiktok.toLocaleString()} 회`}
            </span>
          </p>
        </section>
      </div>

      <SocialPanels keyword={keyword} />
    </div>
  );
}
