"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { CATEGORIES, type Category } from "@/lib/types";
import { byRiseDesc, computeTrend, statusOf, type TrendStatus } from "@/lib/trend";
import { formatCount, formatDateTime, formatPct, pctColor } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

type Msg = { kind: "ok" | "error"; text: string } | null;
type FilterKey = "all" | "up" | "flat" | "down";

function kindOf(status: TrendStatus): FilterKey {
  if (status === "surge" || status === "up") return "up";
  if (status === "down") return "down";
  return "flat";
}

function rankBadge(rank: number): { fg: string; bg: string } {
  if (rank === 1) return { fg: "#8a6a00", bg: "#fbf0ce" };
  if (rank === 2) return { fg: "#5c5a54", bg: "#eceae4" };
  if (rank === 3) return { fg: "#8a4a28", bg: "#f5e4d8" };
  return { fg: "#9c978c", bg: "#f4f2ed" };
}

function scoreBar(status: TrendStatus): string {
  if (status === "surge" || status === "up")
    return "linear-gradient(90deg,#82bc00,#4e8b10)";
  if (status === "down") return "linear-gradient(90deg,#e0a98f,#c86a45)";
  return "linear-gradient(90deg,#cfcabe,#a9a498)";
}

function DeltaCell({ v }: { v: number | null }) {
  const dir = v === null ? "flat" : v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
  const path =
    dir === "up" ? "M6 15l6-6 6 6" : dir === "down" ? "M6 9l6 6 6-6" : "M5 12h14";
  const stroke = dir === "up" ? "#3e7a0c" : dir === "down" ? "#b0512f" : "#b4afa4";
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold tabular-nums ${pctColor(v)}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.6">
        <path d={path} />
      </svg>
      {formatPct(v)}
    </span>
  );
}

function KpiCard({
  label,
  value,
  unit,
  sub,
  iconBg,
  iconFg,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  iconBg: string;
  iconFg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-[0_6px_20px_rgba(35,33,28,0.05)]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-muted-strong">{label}</span>
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
          style={{ background: iconBg, color: iconFg }}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
      </div>
      <div className="mt-2.5 text-xs text-muted">{sub}</div>
    </div>
  );
}

const ico = (path: string, sw = 2) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <path d={path} />
  </svg>
);

export default function DiscoveryDashboard() {
  const {
    hydrated,
    seeds,
    setSeeds,
    candidates,
    discovering,
    lastDiscoveryAt,
    runDiscovery,
    saveCandidate,
    keywords,
    refreshAll,
    refreshYouTube,
    refreshInstagram,
    refreshing,
  } = useStore();

  const [seedInput, setSeedInput] = useState("");
  const [saveCategory, setSaveCategory] = useState<Category>("디저트");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [wlMsg, setWlMsg] = useState<Msg>(null);

  const savedNames = useMemo(() => new Set(keywords.map((k) => k.name)), [keywords]);
  const watchlist = useMemo(() => [...keywords].sort(byRiseDesc), [keywords]);

  const enriched = useMemo(
    () =>
      candidates.map((c, i) => {
        const status: TrendStatus = c.riseRate === null ? "none" : statusOf(c.riseRate);
        return { ...c, rank: i + 1, status, kind: kindOf(status) };
      }),
    [candidates],
  );

  const counts = useMemo(() => {
    const acc = { all: enriched.length, up: 0, flat: 0, down: 0 };
    for (const c of enriched) acc[c.kind] += 1;
    return acc;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return enriched.filter(
      (c) => (filter === "all" || c.kind === filter) && (!q || c.name.includes(q)),
    );
  }, [enriched, filter, query]);

  const maxScore = useMemo(
    () => Math.max(1, ...enriched.map((c) => c.score)),
    [enriched],
  );
  const topCand = enriched[0];
  const avgScore = enriched.length
    ? (enriched.reduce((a, c) => a + c.score, 0) / enriched.length).toFixed(1)
    : "0";
  const ytCount = keywords.filter((k) => k.youtube).length;
  const igCount = keywords.filter((k) => k.instagram).length;

  function addSeed(e: React.FormEvent) {
    e.preventDefault();
    const s = seedInput.trim().replace(/\s+/g, "");
    if (s && !seeds.includes(s)) setSeeds([...seeds, s]);
    setSeedInput("");
  }
  async function onDiscover() {
    setMsg(null);
    const r = await runDiscovery();
    setMsg(
      r.error
        ? { kind: "error", text: r.error }
        : { kind: "ok", text: `발굴 완료 · 후보 ${r.ok}개 (검색량·상승률 반영)` },
    );
  }
  async function onRefreshData() {
    setWlMsg(null);
    const r = await refreshAll();
    setWlMsg(
      r.error
        ? { kind: "error", text: r.error }
        : { kind: "ok", text: `실데이터 갱신 · ${r.ok}개 업데이트` },
    );
  }
  async function onRefreshSocial() {
    setWlMsg(null);
    const [yt, ig] = await Promise.all([refreshYouTube(), refreshInstagram()]);
    setWlMsg({
      kind: yt.ok > 0 || ig.ok > 0 ? "ok" : "error",
      text: `소셜 신호 · ${yt.error ? "YouTube 실패" : `YouTube ${yt.ok}개`} / ${
        ig.error ? "Instagram 실패" : `Instagram ${ig.ok}개`
      }`,
    });
  }

  if (!hydrated) return <LoadingBlock />;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "up", label: "상승" },
    { key: "flat", label: "보합" },
    { key: "down", label: "하락" },
  ];

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[640px]">
          <div className="mb-2.5 flex items-center gap-2.5">
            <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">
              키워드 발굴 대시보드
            </h1>
            <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
              MVP
            </span>
          </div>
          <p className="mb-3 text-sm leading-relaxed text-muted-strong">
            시드에서 연관 검색어를 발굴해 검색량·상승률이 함께 높은 키워드를 찾고,
            YouTube·Instagram으로 교차 검증합니다.
          </p>
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-bright shadow-[0_0_0_3px_rgba(130,188,0,0.18)]" />
            마지막 발굴 · {formatDateTime(lastDiscoveryAt)}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <button
            onClick={onRefreshData}
            disabled={refreshing}
            className="flex h-[42px] items-center gap-1.5 rounded-[11px] border border-line bg-white px-4 text-[13.5px] font-semibold text-muted-strong transition-colors hover:border-[#dedad1] hover:text-foreground disabled:opacity-50"
          >
            {ico("M3 12a9 9 0 1 0 3-6.7L3 8")}
            갱신
          </button>
          <button
            onClick={onDiscover}
            disabled={discovering}
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="flex h-[42px] items-center gap-2 rounded-[11px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          >
            {ico("m5 3 14 9-14 9V3z", 2.2)}
            {discovering ? "발굴 중…" : "발굴 실행"}
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="발굴 후보"
          value={String(enriched.length)}
          unit="개"
          sub="이번 발굴 · 검색량·상승률 반영"
          iconBg="#f1f7e5"
          iconFg="#4e8b10"
          icon={ico("m5 3 14 9-14 9V3z", 2.2)}
        />
        <KpiCard
          label="저장 후보"
          value={String(keywords.length)}
          unit="개"
          sub="관리 중 · 소셜 신호 검증"
          iconBg="#eef3fb"
          iconFg="#3e6db0"
          icon={ico("M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z")}
        />
        <KpiCard
          label="상승 신호"
          value={String(counts.up)}
          unit="개"
          sub="상승률 상위 키워드"
          iconBg="#edf5e0"
          iconFg="#5a9b12"
          icon={ico("M3 17l6-6 4 4 8-8M17 7h4v4", 2.2)}
        />
        <KpiCard
          label="평균 발굴점수"
          value={avgScore}
          sub={topCand ? `최고 ${topCand.score} · ${topCand.name}` : "발굴 전"}
          iconBg="#fbf3de"
          iconFg="#b08910"
          icon={ico("M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.5 5.7 21l2.3-7.1-6-4.5h7.6z")}
        />
      </div>

      {/* SEED KEYWORDS */}
      <div className="mb-7 rounded-2xl border border-line bg-white p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4e8b10" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
            </svg>
            <span className="text-sm font-bold">시드 키워드</span>
            <span className="hidden text-[12.5px] text-muted sm:inline">
              검색광고 연관 키워드 발굴의 출발점
            </span>
          </div>
          <span className="text-xs text-muted">{seeds.length}개 활성</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {seeds.map((s) => (
            <span
              key={s}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#dfebc6] bg-accent-soft pl-3 pr-2 text-[13px] font-semibold text-accent-ink"
            >
              {s}
              <button
                onClick={() => setSeeds(seeds.filter((x) => x !== s))}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-md text-[#7aa33f] transition-colors hover:bg-[#e2efcb] hover:text-accent-ink"
                aria-label={`${s} 제거`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <form onSubmit={addSeed}>
            <input
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="+ 시드 추가"
              className="h-[34px] w-[130px] rounded-[10px] border border-dashed border-[#d8d3c9] bg-white px-3 text-[13px] font-semibold text-muted-strong outline-none placeholder:text-muted focus:border-accent-bright"
            />
          </form>
        </div>
      </div>

      {/* RANKING HEADER */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">발굴 랭킹</h2>
          {enriched.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-ink">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              발굴 완료 · 후보 {enriched.length}개
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[12.5px] text-muted">저장 시 카테고리</span>
          <select
            value={saveCategory}
            onChange={(e) => setSaveCategory(e.target.value as Category)}
            className="h-9 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold outline-none focus:border-accent-bright"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-3.5 rounded-xl px-4 py-3 text-sm ${
            msg.kind === "error" ? "bg-down-soft text-down" : "bg-accent-soft text-accent-ink"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* TOOLBAR */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-0.5 rounded-[11px] border border-line bg-[#f2f0eb] p-[3px]">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-[12.5px] transition-colors ${
                  active
                    ? "bg-white font-bold text-foreground shadow-[0_1px_3px_rgba(35,33,28,0.09)]"
                    : "font-semibold text-muted-strong hover:text-foreground"
                }`}
              >
                {f.label}
                <span className="text-[11px] font-bold text-muted">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex h-9 w-[240px] items-center gap-2 rounded-[10px] border border-line bg-white px-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9c978c" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키워드 필터"
            className="w-full bg-transparent text-[13px] outline-none"
          />
        </div>
      </div>

      {/* RANKING TABLE */}
      <div className="mb-11 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
        {enriched.length === 0 ? (
          <EmptyBlock
            title="아직 발굴 결과가 없습니다"
            desc="시드를 확인하고 발굴 실행을 눌러보세요. (검색광고 API 키가 필요합니다 — README 참고)"
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock
            title="일치하는 키워드가 없습니다"
            desc="필터를 초기화하거나 새 시드 키워드로 발굴을 실행해 보세요."
            onReset={() => {
              setFilter("all");
              setQuery("");
            }}
          />
        ) : (
          <div className="nt-scroll max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="sticky top-0 z-[2] bg-[#fcfbf8] shadow-[inset_0_-1px_0_#eae7e0]">
                  <Th className="w-16 pl-6 text-left">순위</Th>
                  <Th className="text-left">키워드</Th>
                  <Th className="text-right">월 검색량</Th>
                  <Th className="text-right">상승률</Th>
                  <Th className="w-24 text-center">상태</Th>
                  <Th className="w-[200px] text-left">발굴점수</Th>
                  <Th className="w-24 pr-6 text-right">저장</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const rb = rankBadge(c.rank);
                  const saved = savedNames.has(c.name);
                  return (
                    <tr key={c.name} className="border-t border-line-soft hover:bg-[#fcfbf6]">
                      <td className="py-3.5 pl-6 pr-4">
                        <span
                          className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-lg px-1.5 text-[12.5px] font-extrabold"
                          style={{ color: rb.fg, background: rb.bg }}
                        >
                          {c.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold">{c.name}</td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#3b382f]">
                        {formatCount(c.volumeTotal)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <DeltaCell v={c.riseRate} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0eee9]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round((c.score / maxScore) * 100)}%`,
                                background: scoreBar(c.status),
                              }}
                            />
                          </div>
                          <span className="min-w-[22px] text-right text-sm font-extrabold tabular-nums">
                            {c.score}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right">
                        {saved ? (
                          <span className="inline-flex h-8 items-center gap-1 rounded-[9px] border border-[#c9e09a] bg-accent-soft px-3 text-[12.5px] font-bold text-accent-ink">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            저장됨
                          </span>
                        ) : (
                          <button
                            onClick={() => saveCandidate(c, saveCategory)}
                            className="h-8 rounded-[9px] border border-line bg-white px-3.5 text-[12.5px] font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:bg-[#fafdf3] hover:text-accent"
                          >
                            저장
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SAVED CANDIDATES */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-extrabold tracking-tight">저장한 후보</h2>
          <span className="text-sm font-bold text-muted">{watchlist.length}개</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefreshData}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-semibold text-muted-strong transition-colors hover:border-[#dedad1] hover:text-foreground disabled:opacity-50"
          >
            {ico("M3 12a9 9 0 1 0 3-6.7L3 8", 2)}
            실데이터 갱신
          </button>
          <button
            onClick={onRefreshSocial}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-semibold text-muted-strong transition-colors hover:border-[#dedad1] hover:text-foreground disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            소셜 신호 갱신
          </button>
        </div>
      </div>

      {wlMsg && (
        <div
          className={`mb-3.5 rounded-xl px-4 py-3 text-sm ${
            wlMsg.kind === "error" ? "bg-down-soft text-down" : "bg-accent-soft text-accent-ink"
          }`}
        >
          {wlMsg.text}
        </div>
      )}

      {watchlist.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-xl border border-[#dfebc6] bg-accent-soft px-4 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4e8b10" strokeWidth="2">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <span className="text-[13px] font-semibold text-accent-ink">
            소셜 신호 · YouTube {ytCount}개
          </span>
          <span className="text-[12.5px] text-[#7aa33f]">
            / Instagram {igCount > 0 ? `${igCount}개` : "미수집"}
          </span>
          {igCount === 0 && (
            <span className="ml-0.5 rounded-full bg-[#f7ece6] px-2 py-0.5 text-[11px] font-bold text-down">
              계정 설정 필요
            </span>
          )}
        </div>
      )}

      {watchlist.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-10 text-center text-sm text-muted">
          발굴 랭킹에서 유망 키워드를 <b className="font-semibold text-muted-strong">저장</b>하면
          여기에서 트렌드·YouTube·Instagram으로 교차 검증할 수 있습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
          <div className="nt-scroll overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-[#fcfbf8] shadow-[inset_0_-1px_0_#eae7e0]">
                  <Th className="pl-6 text-left">키워드</Th>
                  <Th className="w-[120px] text-left">카테고리</Th>
                  <Th className="w-[120px] text-center">상태</Th>
                  <Th className="text-right">상승률</Th>
                  <Th className="text-right">월 검색량</Th>
                  <Th className="text-right">YT 영상수</Th>
                  <Th className="pr-6 text-right">YT 숏츠</Th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((k) => {
                  const t = computeTrend(k);
                  return (
                    <tr key={k.id} className="border-t border-line-soft hover:bg-[#fcfbf6]">
                      <td className="py-[15px] pl-6 pr-4 font-semibold">
                        <Link href={`/keywords/${k.id}`} className="hover:text-accent-ink hover:underline">
                          {k.name}
                        </Link>
                      </td>
                      <td className="px-4 py-[15px]">
                        <span className="rounded-md bg-[#f2f0eb] px-2.5 py-1 text-xs font-semibold text-muted-strong">
                          {k.category}
                        </span>
                      </td>
                      <td className="px-4 py-[15px] text-center">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-[15px] text-right">
                        <DeltaCell v={t.riseRate} />
                      </td>
                      <td className="px-4 py-[15px] text-right tabular-nums text-muted">
                        {k.volumeTotal ? formatCount(k.volumeTotal) : "—"}
                      </td>
                      <td className="px-4 py-[15px] text-right font-semibold tabular-nums text-[#3b382f]">
                        {k.youtube ? formatCount(k.youtube.videoCount) : "—"}
                      </td>
                      <td className="py-[15px] pl-4 pr-6 text-right font-semibold tabular-nums text-[#3b382f]">
                        {k.youtube ? formatCount(k.youtube.shortCount) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-7 border-t border-line pt-5 text-xs text-muted">
        NATA TABLE 트렌드 모니터 · MVP · 데이터: 네이버 검색광고·데이터랩 · YouTube · Instagram
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-[11.5px] font-bold tracking-[0.03em] text-muted ${className}`}
    >
      {children}
    </th>
  );
}

function EmptyBlock({
  title,
  desc,
  onReset,
}: {
  title: string;
  desc: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-[72px] text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#f2f0eb]">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#b4afa4" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
      </div>
      <div className="mb-1.5 text-[15px] font-bold text-[#3b382f]">{title}</div>
      <div className="max-w-[340px] text-[13px] leading-relaxed text-muted">{desc}</div>
      {onReset && (
        <button
          onClick={onReset}
          className="mt-4 h-[38px] rounded-[10px] border border-line bg-white px-4 text-[13px] font-semibold text-accent transition-colors hover:border-accent-bright hover:bg-[#fafdf3]"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-[#f0eee9]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#f0eee9]" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-[#f0eee9]" />
    </div>
  );
}
