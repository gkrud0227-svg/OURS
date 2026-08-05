"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore, OVERSEAS_REGIONS } from "@/lib/store-context";
import { weightFor, applyWeight, neutralWeights, type SignalWeights } from "@/lib/signal-weights";
import { fetchSignalWeights } from "@/lib/weights-client";
import { type Category, type DiscoverySource } from "@/lib/types";
import {
  byRiseDesc,
  computeTrend,
  discoveryScore,
  gateByLevel,
  trendFromWeeks,
  type TrendStatus,
} from "@/lib/trend";
import { guessFoodType } from "@/lib/odm";
import { shopGrade } from "@/lib/shopping";
import type { DiscoverCandidate } from "@/lib/global";
import { formatCount, formatDateTime, formatPct, pctColor } from "@/lib/format";
import { PatternTag, StatusBadge } from "@/components/StatusBadge";

type Msg = { kind: "ok" | "error"; text: string } | null;
type FilterKey = "all" | "up" | "flat" | "down";

function kindOf(status: TrendStatus): FilterKey {
  if (status === "surge" || status === "up") return "up";
  if (status === "down") return "down";
  return "flat";
}

/** 발굴 출처 배지 — 유튜브(콘텐츠발)·검색(자동완성발)·둘 다. */
const SOURCE_META: Record<DiscoverySource, { label: string; cls: string }> = {
  youtube: { label: "유튜브", cls: "bg-[#f7ece6] text-down" },
  search: { label: "검색", cls: "bg-[#eef3fb] text-[#365a8f]" },
  both: { label: "유튜브+검색", cls: "bg-accent-soft text-accent-ink" },
};

/**
 * 규모 확인 문턱 — 월 검색량(keywordstool)이 이만큼도 안 되면 "규모 미확인"으로 본다.
 * 0은 keywordstool이 그 단어를 아예 못 준 것(측정 불가) — 상승률 %만으론 트렌드라 부르지 않는다.
 */
const VOLUME_CONFIRM_FLOOR = 100;

/** 해외 발굴: 최근 이만큼 채널이 안 쓰면 표본이 작아 트렌드로 보기 어렵다(하단·배지 처리). */
const MIN_OVERSEAS_CHANNELS = 8;

/** 발굴 1회 시드당 유튜브 검색 쿼터 추정 — 최근 2페이지 + 기준선 3페이지 × 100 units. */
const YT_UNITS_PER_SEED = 500;

/**
 * 트렌드 판정 배지 — "발굴됐다" / "실제로 뜬다" / "규모 미확인"을 구분한다.
 * 상승률(%)이 올라도 **월 검색량이 뒷받침(규모 확인)돼야** 트렌드로 표시한다.
 * 규모 미확인(검색량 0)이면 상승률이 커도 노이즈일 수 있어 낮춰 표시한다.
 */
function trendMark(status: TrendStatus, confirmed: boolean): { label: string; cls: string } | null {
  if (status !== "surge" && status !== "up") return null; // 유지·하락·데이터없음 = 관망
  if (!confirmed) return { label: "신규 검색어", cls: "bg-[#fbf3de] text-[#8a6a00]" }; // 검색광고에 아직 집계 안 됨(새로 뜨는 검색어, 노이즈 주의)
  if (status === "surge") return { label: "🔥 트렌드", cls: "bg-accent-soft text-accent-ink" };
  return { label: "상승세", cls: "bg-accent-tint text-accent-ink" };
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
    deleteKeyword,
    refreshAll,
    refreshYouTube,
    refreshing,
    overseasSeeds,
    setOverseasSeeds,
    overseasCandidates,
  } = useStore();

  const [seedInput, setSeedInput] = useState("");
  // 저장 시 카테고리 선택 UI는 제거됨. 데이터 모델상 필요한 기본값만 내부로 둔다.
  const saveCategory: Category = "디저트";
  // 기본은 "전체" — 발굴된 후보 전부를 먼저 보여주고, 필요하면 상승/유지/하락으로 좁힌다.
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<"rise" | "score">("rise");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [wlMsg, setWlMsg] = useState<Msg>(null);
  // 3단계 — 학습된 신호 가중치(발굴 점수에 반영). 없으면 중립이라 무영향.
  const [weights, setWeights] = useState<SignalWeights>(neutralWeights());
  useEffect(() => {
    fetchSignalWeights()
      .then(setWeights)
      .catch(() => {});
  }, []);

  const savedNames = useMemo(() => new Set(keywords.map((k) => k.name)), [keywords]);
  const watchlist = useMemo(() => [...keywords].sort(byRiseDesc), [keywords]);

  // 콘텐츠 신호(유튜브)가 하나도 안 들어왔나 — 후보가 전부 검색 자동완성발이면 유튜브 발굴이
  // 실패(쿼터 등)한 것. 이때 결과는 신조어를 못 잡는 "반쪽"이라 신뢰도가 낮음을 알린다.
  const contentMissing = useMemo(
    () => candidates.length > 0 && candidates.every((c) => c.source === "search"),
    [candidates],
  );

  // 유튜브 발굴 후보를 4주 흐름 기준으로 재계산 (이동평균 상승률 + 패턴).
  // 신조어는 검색광고에 월 검색량이 없을 수 있어 검색량으로 거르지 않는다.
  const enriched = useMemo(() => {
    const pool = candidates;
    const maxVol = Math.max(1, ...pool.map((c) => c.volumeTotal));
    const scored = pool.map((c) => {
      const t = trendFromWeeks(c.weeks);
      // 자기 이력 바닥 근처의 미세 상승은 관망(flat)으로 낮춘다.
      const status = gateByLevel(t.status, c.weeks);
      // 월 검색량이 뒷받침되는가(규모 확인). 규모 미확인은 **분류를 바꾸지 않고 배지로만** 알린다.
      // (상태 컬럼과 필터 분류가 어긋나지 않도록 — 급상승은 급상승으로 분류)
      const confirmed = c.volumeTotal >= VOLUME_CONFIRM_FLOOR;
      return {
        ...c,
        riseRate: t.riseRate,
        status,
        confirmed,
        pattern: t.pattern,
        streak: t.streak,
        kind: kindOf(status),
        // 발굴 점수에 학습된 신호 신뢰도(출처·신규여부 오탐률)를 배수로 반영. 중립이면 무영향.
        score: applyWeight(
          discoveryScore(c.volumeTotal, maxVol, t.riseRate, t.pattern, t.streak),
          weightFor(weights, { source: c.source, novel: c.novel }),
        ),
      };
    });
    scored.sort((a, b) => {
      // 비식품 판정(유튜브 발굴 후보) 은 항상 맨 아래로 강등한다.
      const nf = (x: (typeof scored)[number]) => (x.contextTag === "nonfood" ? 1 : 0);
      if (nf(a) !== nf(b)) return nf(a) - nf(b);
      if (sortBy === "score") return b.score - a.score;
      // 상승률 기준 정렬 (데이터 없음은 뒤로), 동률이면 발굴점수. 신규 검색어는 배지로 구분.
      const ra = a.riseRate;
      const rb = b.riseRate;
      if (ra === null && rb === null) return b.score - a.score;
      if (ra === null) return 1;
      if (rb === null) return -1;
      if (rb !== ra) return rb - ra;
      return b.score - a.score;
    });
    return scored.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [candidates, sortBy, weights]);

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

  function addSeed(e: React.FormEvent) {
    e.preventDefault();
    const s = seedInput.trim().replace(/\s+/g, "");
    if (s && !seeds.includes(s)) setSeeds([...seeds, s]);
    setSeedInput("");
  }
  async function onDiscover() {
    setMsg(null);
    const nRegions = OVERSEAS_REGIONS.length;
    const total = (seeds.length + overseasSeeds.length * nRegions) * YT_UNITS_PER_SEED;
    const okToRun = window.confirm(
      `키워드 발굴은 유튜브 API 쿼터를 씁니다.\n` +
        `국내 ${seeds.length}개 + 해외 ${overseasSeeds.length}개 시드(리전 ${nRegions}곳: ${OVERSEAS_REGIONS.join("·")})를 각각 조회합니다.\n` +
        `시드당 약 ${YT_UNITS_PER_SEED} units, 총 약 ${total} units.\n` +
        `기본 쿼터는 하루 10,000 units입니다. 진행할까요?`,
    );
    if (!okToRun) return;
    const r = await runDiscovery();
    const os = r.overseas != null ? ` · 해외 ${r.overseas}개(US)` : "";
    setMsg(
      r.error
        ? { kind: "error", text: `${r.error}${os ? `${os}는 발굴됨` : ""}` }
        : { kind: "ok", text: `발굴 완료 · 국내 ${r.ok}개(검색 검증)${os}` },
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
    const n = watchlist.length;
    const ok = window.confirm(
      `YouTube 신호 갱신은 유튜브 API 쿼터를 씁니다.\n` +
        `저장한 후보 ${n}개를 각각 조회합니다 (약 ${n * 100} units).\n` +
        `기본 쿼터는 하루 10,000 units입니다. 진행할까요?`,
    );
    if (!ok) return;
    const yt = await refreshYouTube();
    setWlMsg({
      kind: yt.ok > 0 ? "ok" : "error",
      text: yt.error ? "YouTube 신호 실패" : `YouTube 신호 · ${yt.ok}개 업데이트`,
    });
  }

  if (!hydrated) return <LoadingBlock />;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "up", label: "상승" },
    { key: "flat", label: "유지" },
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
            <b className="font-medium">국내</b>는 유튜브 콘텐츠에서 신조어를 발굴하고, 그 발굴어를{" "}
            <b className="font-medium">네이버 검색 자동완성으로 확장</b>한 뒤{" "}
            <b className="font-medium">검색 급상승으로 검증</b>합니다.{" "}
            <b className="font-medium">해외(미국)</b>는 검색 소스가 없어{" "}
            <b className="font-medium">콘텐츠 급상승(lift)</b>만 봅니다. 한 번의 발굴로 아래 두 랭킹이 함께 채워집니다.
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
            검색 추이 갱신
          </button>
          <button
            onClick={onDiscover}
            disabled={discovering}
            title="유튜브 API 쿼터를 사용합니다 (시드 1개당 약 500 units)"
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="flex h-[42px] items-center gap-2 rounded-[11px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          >
            {ico("m5 3 14 9-14 9V3z", 2.2)}
            {discovering ? "발굴 중…" : "키워드 발굴"}
            {!discovering && (
              <span className="rounded bg-white/20 px-1.5 py-[1px] text-[10px] font-bold text-white">
                쿼터
              </span>
            )}
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
          sub="관리 중 · 검색·YouTube 검증"
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
              유튜브 신조어 발굴의 출발점 · 의도어(신상·유행) 포함
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

      {/* 콘텐츠 신호 없음 경고 — 유튜브 발굴 실패(쿼터) 시 자동완성 반쪽 결과임을 알림 */}
      {contentMissing && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#e8c9a0] bg-[#fdf3e6] px-4 py-3.5 text-[13.5px] leading-relaxed text-[#8a5a00]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 flex-shrink-0">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <p>
            <b className="font-bold">콘텐츠 신호 없음 · 유튜브 발굴 실패(쿼터 소진).</b>{" "}
            지금 목록은 <b className="font-semibold">네이버 검색 자동완성만으로</b> 뽑은 것이라 새로 뜨는
            신조어를 못 잡고 <b className="font-semibold">이미 자리잡은 제품</b>이 섞여 신뢰도가 낮습니다.
            유튜브 쿼터가 회복된 뒤(한국시간 16~17시경) 다시 <b className="font-semibold">발굴 실행</b>하면
            콘텐츠 급상승으로 잡히는 진짜 트렌드가 나옵니다.
          </p>
        </div>
      )}

      {/* RANKING HEADER */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">국내 발굴 랭킹</h2>
          <span className="rounded-full bg-accent-soft px-2 py-[3px] text-[11px] font-bold text-accent">
            검색 검증
          </span>
          {enriched.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-ink">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              발굴 완료 · 후보 {enriched.length}개
            </span>
          )}
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
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="cursor-help text-[12px] text-muted"
            title="유튜브 콘텐츠에서 신조어를 발굴하고 네이버 검색으로 검증합니다. 검색량은 있으면 함께 표시(신조어는 없을 수 있음)."
          >
            유튜브 발굴 · 검색 검증
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "rise" | "score")}
            title="랭킹 정렬 기준"
            className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[12.5px] font-semibold outline-none focus:border-accent-bright"
          >
            <option value="rise">상승률순</option>
            <option value="score">발굴점수순</option>
          </select>
          <div className="flex h-9 w-[200px] items-center gap-2 rounded-[10px] border border-line bg-white px-3">
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
      </div>

      {/* RANKING TABLE */}
      <div className="mb-11 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
        {enriched.length === 0 ? (
          <EmptyBlock
            title="아직 발굴 결과가 없습니다"
            desc="시드를 확인하고 발굴 실행을 눌러보세요. (YouTube API 키가 필요합니다 — README 참고)"
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock
            title={filter === "up" ? "지금 상승 중인 트렌드가 없습니다" : "일치하는 키워드가 없습니다"}
            desc={
              filter === "up"
                ? "발굴은 됐지만 검색이 오르는 후보가 없습니다. ‘전체’로 발굴된 후보 전부를 볼 수 있어요."
                : "필터를 초기화하거나 새 시드 키워드로 발굴을 실행해 보세요."
            }
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
                  <Th className="w-24 text-center">상태</Th>
                  <Th
                    className="text-right"
                    title="4주 흐름 반영 — 최근 2주 평균 대비 이전 2주 평균 변화율"
                  >
                    상승률
                  </Th>
                  <Th className="text-right">월 검색량</Th>
                  <Th className="w-[200px] text-left">발굴점수</Th>
                  <Th className="w-32 pr-6 text-right">저장</Th>
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
                      <td className="px-4 py-3.5 font-semibold">
                        {c.name}
                        {(() => {
                          const tm = trendMark(c.status, c.confirmed);
                          return tm ? (
                            <span className={`ml-2 rounded-full px-2 py-[2px] text-[10px] font-bold ${tm.cls}`}>
                              {tm.label}
                            </span>
                          ) : null;
                        })()}
                        {shopGrade(c.shop) === "rising" && (
                          <span
                            title={`쇼핑 클릭도 상승 — 관심이 구매 의향까지 이어짐${
                              c.shop?.riseRate != null ? ` (구매 +${Math.round(c.shop.riseRate)}%)` : ""
                            }. 국내 트렌드 탭의 '삼중 확인'과 같은 신호.`}
                            className="ml-1.5 cursor-help rounded-full bg-accent px-2 py-[2px] text-[10px] font-bold text-white"
                          >
                            구매 ↑
                          </span>
                        )}
                        {c.source && (
                          <span className={`ml-1.5 rounded-full px-2 py-[2px] text-[10px] font-bold ${SOURCE_META[c.source].cls}`}>
                            {SOURCE_META[c.source].label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={c.status} />
                          <PatternTag pattern={c.pattern} streak={c.streak} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <DeltaCell v={c.riseRate} />
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#3b382f]">
                        {c.volumeTotal > 0 ? formatCount(c.volumeTotal) : "—"}
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
                          <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[9px] border border-[#c9e09a] bg-accent-soft px-3 text-[12.5px] font-bold text-accent-ink">
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

      {/* OVERSEAS (US) DISCOVERY — 콘텐츠 급상승만 (해외엔 한국 검색 소스가 없음) */}
      <OverseasSection
        seeds={overseasSeeds}
        setSeeds={setOverseasSeeds}
        candidates={overseasCandidates}
        savedNames={savedNames}
        onSave={(c) =>
          saveCandidate(
            {
              name: c.term.replace(/^#/, ""),
              lift: c.lift,
              novel: c.novel,
              volumePc: 0,
              volumeMobile: 0,
              volumeTotal: 0,
              weeks: [],
              riseRate: null,
              score: c.score ?? 0,
            },
            saveCategory,
          )
        }
      />

      {/* SAVED CANDIDATES */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-extrabold tracking-tight">저장한 후보</h2>
          <span className="text-sm font-bold text-muted">{watchlist.length}개</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-[11.5px] text-muted sm:inline">
            검색 추이는 상단 &lsquo;검색 추이 갱신&rsquo;에서
          </span>
          <button
            onClick={onRefreshSocial}
            disabled={refreshing}
            title="유튜브 API 쿼터를 사용합니다 (저장 후보 1개당 약 100 units)"
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f0d9c9] bg-white px-3.5 text-[12.5px] font-semibold text-muted-strong transition-colors hover:border-[#e6c3ae] hover:text-foreground disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            YouTube 신호 갱신
            <span className="ml-0.5 rounded bg-[#fbeede] px-1.5 py-[1px] text-[10px] font-bold text-[#a5591f]">
              쿼터
            </span>
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
            YouTube 신호 · {ytCount}개 수집
          </span>
        </div>
      )}

      {watchlist.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-10 text-center text-sm text-muted">
          발굴 랭킹에서 유망 키워드를 <b className="font-semibold text-muted-strong">저장</b>하면
          여기에서 검색 추이·YouTube 신호로 교차 검증할 수 있습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
          <div className="nt-scroll overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-[#fcfbf8] shadow-[inset_0_-1px_0_#eae7e0]">
                  <Th className="pl-6 text-left">키워드</Th>
                  <Th className="w-[120px] text-center">상태</Th>
                  <Th
                    className="text-right"
                    title="4주 흐름 반영 — 최근 2주 평균 대비 이전 2주 평균 변화율"
                  >
                    상승률
                  </Th>
                  <Th className="text-right">월 검색량</Th>
                  <Th className="text-right">YT 영상수</Th>
                  <Th className="text-right">YT 숏츠</Th>
                  <Th className="pr-6 text-right">제조사</Th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((k) => {
                  const t = computeTrend(k);
                  return (
                    <tr key={k.id} className="border-t border-line-soft hover:bg-[#fcfbf6]">
                      <td className="py-[15px] pl-6 pr-4 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/keywords/${k.id}`} className="hover:text-accent-ink hover:underline">
                            {k.name}
                          </Link>
                          <button
                            onClick={() => deleteKeyword(k.id)}
                            title="저장 목록에서 삭제"
                            aria-label={`${k.name} 삭제`}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-md text-muted transition-colors hover:bg-down-soft hover:text-down"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      </td>
                      <td className="px-4 py-[15px]">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={t.status} />
                          <PatternTag pattern={t.pattern} streak={t.streak} />
                        </div>
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
                      <td className="px-4 py-[15px] text-right font-semibold tabular-nums text-[#3b382f]">
                        {k.youtube ? formatCount(k.youtube.shortCount) : "—"}
                      </td>
                      <td className="py-[15px] pl-4 pr-6 text-right">
                        {(() => {
                          const type = guessFoodType(k.name);
                          const href = type
                            ? `/odm?type=${encodeURIComponent(type)}&term=${encodeURIComponent(k.name)}`
                            : `/odm?term=${encodeURIComponent(k.name)}`;
                          return (
                            <Link
                              href={href}
                              title={
                                type
                                  ? `"${k.name}" → ${type} 제조 이력이 있는 ODM 업체 찾기`
                                  : `"${k.name}" 제조사 찾기 (ODM 화면에서 유형 선택)`
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-[9px] border border-line px-2.5 py-1.5 text-xs font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:bg-accent-soft hover:text-accent"
                            >
                              ODM
                              {type && <span className="font-normal text-muted">· {type}</span>}
                            </Link>
                          );
                        })()}
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
        NATA TABLE 트렌드 모니터 · MVP · 데이터: 네이버 검색광고·데이터랩 · YouTube
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th
      title={title}
      className={`px-4 py-3 text-[11.5px] font-bold tracking-[0.03em] text-muted ${
        title ? "cursor-help" : ""
      } ${className}`}
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

/**
 * 해외(미국) 발굴 랭킹. 국내와 달리 검색 검증 소스가 없어 유튜브 콘텐츠 급상승
 * (lift = 최근 채널 확산 배수)만으로 줄을 세운다. 국내 발굴과 같은 엔진·같은 발굴
 * 버튼으로 채워지고, 시드는 여기서 직접 편집한다.
 */
function OverseasSection({
  seeds,
  setSeeds,
  candidates,
  savedNames,
  onSave,
}: {
  seeds: string[];
  setSeeds: (seeds: string[]) => void;
  candidates: DiscoverCandidate[];
  savedNames: Set<string>;
  onSave: (c: DiscoverCandidate) => void;
}) {
  const [seedInput, setSeedInput] = useState("");
  const novelCount = candidates.filter((c) => c.novel).length;
  // 채널 수가 너무 적으면(표본 부족) 트렌드로 보기 어렵다. 확산 채널 충분한 것을 위로.
  const sorted = [...candidates].sort((a, b) => {
    const qa = a.dfRecent >= MIN_OVERSEAS_CHANNELS ? 1 : 0;
    const qb = b.dfRecent >= MIN_OVERSEAS_CHANNELS ? 1 : 0;
    if (qa !== qb) return qb - qa;
    return b.lift - a.lift;
  });

  function addSeed(e: React.FormEvent) {
    e.preventDefault();
    const s = seedInput.trim();
    if (s && !seeds.includes(s)) setSeeds([...seeds, s]);
    setSeedInput("");
  }

  return (
    <div className="mb-11">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">해외 발굴 랭킹</h2>
          <span className="rounded-full bg-[#eef3fb] px-2 py-[3px] text-[11px] font-bold text-[#3e6db0]">
            {OVERSEAS_REGIONS.join("·")}
          </span>
          {candidates.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-ink">
              후보 {candidates.length}개 · 신조어 {novelCount}개
            </span>
          )}
        </div>
        <span
          className="cursor-help text-[12px] text-muted"
          title="해외엔 한국 검색량 소스(데이터랩·검색광고)가 없어 검색 검증을 못 합니다. 대신 유튜브 콘텐츠 급상승(최근 채널 확산 배수 lift)만으로 순위를 매깁니다."
        >
          콘텐츠 급상승만 · 검색 검증 없음
        </span>
      </div>

      {/* 해외 시드 */}
      <div className="mb-3.5 rounded-2xl border border-line bg-white p-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="text-[13px] font-bold">해외 시드</span>
          <span className="hidden text-[12px] text-muted sm:inline">
            영어 의도어(viral·trending·new) 포함 · 발굴 버튼으로 국내와 함께 실행됩니다
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seeds.map((s) => (
            <span
              key={s}
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[10px] border border-[#dde6f3] bg-[#eef3fb] pl-3 pr-2 text-[12.5px] font-semibold text-[#365a8f]"
            >
              {s}
              <button
                onClick={() => setSeeds(seeds.filter((x) => x !== s))}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-md text-[#7c96bd] transition-colors hover:bg-[#dde6f3] hover:text-[#365a8f]"
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
              placeholder="+ viral snack"
              className="h-[32px] w-[150px] rounded-[10px] border border-dashed border-[#d8d3c9] bg-white px-3 text-[12.5px] font-semibold text-muted-strong outline-none placeholder:text-muted focus:border-[#9db8dd]"
            />
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
        {candidates.length === 0 ? (
          <EmptyBlock
            title="아직 해외 발굴 결과가 없습니다"
            desc="위의 발굴 실행을 누르면 국내와 함께 미국(US) 콘텐츠 급상승 키워드가 채워집니다."
          />
        ) : (
          <div className="nt-scroll max-h-[520px] overflow-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
              <thead>
                <tr className="sticky top-0 z-[2] bg-[#fcfbf8] shadow-[inset_0_-1px_0_#eae7e0]">
                  <Th className="w-14 pl-6 text-left">순위</Th>
                  <Th className="text-left">키워드</Th>
                  <Th className="w-28 text-right" title="과거 기준선 대비 최근 이 말을 쓴 채널이 몇 배 늘었는가">
                    급증 배수
                  </Th>
                  <Th className="w-36 text-right" title="최근 이 말이 제목에 등장한 영상 수. 괄호 안은 그 영상이 퍼진 채널 수 — 한 채널이 여러 영상을 올려도 채널 수는 1로 셉니다.">
                    영상수 (채널)
                  </Th>
                  <Th className="w-28 text-right" title="점수에는 반영하지 않는 참고용 조회수 합">
                    조회수 (참고)
                  </Th>
                  <Th className="w-28 pr-6 text-right">저장</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const rb = rankBadge(i + 1);
                  const term = c.term.replace(/^#/, "");
                  const fewChannels = c.dfRecent < MIN_OVERSEAS_CHANNELS;
                  return (
                    <tr key={c.term} className="border-t border-line-soft hover:bg-[#fcfbf6]">
                      <td className="py-3.5 pl-6 pr-4">
                        <span
                          className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-lg px-1.5 text-[12.5px] font-extrabold"
                          style={{ color: rb.fg, background: rb.bg }}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-accent-ink">{c.term}</span>
                        {fewChannels && (
                          <span
                            title={`최근 ${c.dfRecent}개 채널만 사용 — 표본이 작아 트렌드로 보기 이릅니다.`}
                            className="ml-2 cursor-help rounded-full bg-[#fbf3de] px-2 py-[2px] text-[10.5px] font-bold text-[#8a6a00]"
                          >
                            채널 소량
                          </span>
                        )}
                        {c.novel && (
                          <span
                            title="과거 기준선의 어느 채널도 쓰지 않다가 최근 처음 등장한 용어입니다. 진짜 신조어 여부는 별개 — 표본에 없던 일반어도 포함될 수 있습니다."
                            className="ml-2 cursor-help rounded-full bg-accent-soft px-2 py-[2px] text-[10.5px] font-bold text-accent"
                          >
                            신규 등장
                          </span>
                        )}
                        {c.contextTag === "nonfood" && (
                          <span
                            title={`게임·챌린지 등 비식품 맥락일 수 있습니다 (식품어 포함 ${Math.round((c.foodShare ?? 0) * 100)}%).`}
                            className="ml-1.5 cursor-help rounded-full bg-down-soft px-2 py-[2px] text-[10.5px] font-bold text-down"
                          >
                            비식품?
                          </span>
                        )}
                        {c.examples?.length > 0 && (
                          <p className="mt-1 max-w-[320px] truncate text-[11px] text-muted" title={c.examples.join("  ·  ")}>
                            예: {c.examples[0]}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-bold tabular-nums text-accent">
                        ×{c.lift}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-strong">
                        <span className="font-semibold text-foreground">
                          {formatCount(c.videosRecent ?? c.dfRecent)}
                        </span>
                        <span className="ml-1 text-[11.5px] text-muted">({c.dfRecent})</span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-strong">
                        {formatCount(c.views)}
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right">
                        {savedNames.has(term) ? (
                          <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[9px] border border-[#c9e09a] bg-accent-soft px-3 text-[12.5px] font-bold text-accent-ink">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            저장됨
                          </span>
                        ) : (
                          <button
                            onClick={() => onSave(c)}
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
    </div>
  );
}
