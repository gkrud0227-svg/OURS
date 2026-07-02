"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { CATEGORIES, type Category } from "@/lib/types";
import { byRiseDesc, computeTrend } from "@/lib/trend";
import { formatPct, pctColor } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

const FILTERS: ("전체" | Category)[] = ["전체", ...CATEGORIES];

export default function KeywordsPage() {
  const { hydrated, keywords, addKeyword, deleteKeyword } = useStore();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("디저트");
  const [filter, setFilter] = useState<"전체" | Category>("전체");
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const list =
      filter === "전체"
        ? keywords
        : keywords.filter((k) => k.category === filter);
    return [...list].sort(byRiseDesc);
  }, [keywords, filter]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = addKeyword(name, category);
    if (!ok) {
      setError(
        name.trim()
          ? "이미 등록된 키워드입니다."
          : "키워드를 입력하세요.",
      );
      return;
    }
    setName("");
  }

  if (!hydrated) return <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">키워드 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          모니터링할 키워드를 추가·삭제하고 카테고리로 분류합니다. (총{" "}
          {keywords.length}개)
        </p>
      </header>

      {/* 추가 폼 */}
      <form
        onSubmit={onAdd}
        className="rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="키워드 입력 (예: 크로플)"
            className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            추가
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </form>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          const count =
            f === "전체"
              ? keywords.length
              : keywords.filter((k) => k.category === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {f}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-400">
          해당 카테고리에 키워드가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((k) => {
            const t = computeTrend(k);
            return (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/keywords/${k.id}`}
                      className="truncate font-medium hover:text-accent-ink hover:underline"
                    >
                      {k.name}
                    </Link>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {k.category} ·{" "}
                    <span className={pctColor(t.riseRate)}>
                      {formatPct(t.riseRate)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => deleteKeyword(k.id)}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label={`${k.name} 삭제`}
                >
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
