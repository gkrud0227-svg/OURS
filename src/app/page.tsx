"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore, OVERSEAS_REGIONS } from "@/lib/store-context";
import { weightFor, applyWeight, neutralWeights, type SignalWeights } from "@/lib/signal-weights";
import { fetchSignalWeights } from "@/lib/weights-client";
import { type Candidate, type Category, type DiscoverySource, type WeekPoint } from "@/lib/types";
import {
  byRiseDesc,
  computeTrend,
  discoveryScore,
  gateByLevel,
  patternBonus,
  trendFromWeeks,
  volumeNorm,
  type TrendStatus,
} from "@/lib/trend";
import { guessFoodType } from "@/lib/odm";
import { shopGrade } from "@/lib/shopping";
import type { DiscoverCandidate } from "@/lib/global";
import { formatCount, formatDateTime, formatPct, pctColor } from "@/lib/format";
import { estimateUnits, quotaLine, addQuota } from "@/lib/quota";
import { QuotaBadge } from "@/components/QuotaBadge";
import { PatternTag, StatusBadge } from "@/components/StatusBadge";

type Msg = { kind: "ok" | "error"; text: string } | null;
type FilterKey = "all" | "up" | "flat" | "down";

function kindOf(status: TrendStatus): FilterKey {
  if (status === "surge" || status === "up") return "up";
  if (status === "down") return "down";
  return "flat";
}

/**
 * 발굴 출처 배지 — 유튜브(콘텐츠발)·검색(자동완성발)·둘 다.
 * ⚠️ 출처는 "얼마나 올랐나"가 아니라 "어디서 왔나"라서 그린을 쓰지 않는다.
 *    두 소스에서 함께 잡힌 것만 잉크 면으로 무겁게 준다.
 */
const SOURCE_META: Record<DiscoverySource, { label: string; cls: string }> = {
  youtube: { label: "유튜브", cls: "bg-mutedbg text-ink-3" },
  search: { label: "검색", cls: "border border-chip text-ink-2" },
  both: { label: "유튜브+검색", cls: "bg-ink text-on-dark" },
};

/**
 * 규모 확인 문턱 — 월 검색량(keywordstool)이 이만큼도 안 되면 "규모 미확인"으로 본다.
 * 0은 keywordstool이 그 단어를 아예 못 준 것(측정 불가) — 상승률 %만으론 트렌드라 부르지 않는다.
 */
const VOLUME_CONFIRM_FLOOR = 100;

/** 해외 발굴: 최근 이만큼 채널이 안 쓰면 표본이 작아 트렌드로 보기 어렵다(하단·배지 처리). */
const MIN_OVERSEAS_CHANNELS = 8;

/**
 * 트렌드 판정 배지 — "발굴됐다" / "실제로 뜬다" / "규모 미확인"을 구분한다.
 * 상승률(%)이 올라도 **월 검색량이 뒷받침(규모 확인)돼야** 트렌드로 표시한다.
 * 규모 미확인(검색량 0)이면 상승률이 커도 노이즈일 수 있어 낮춰 표시한다.
 */
function trendMark(status: TrendStatus, confirmed: boolean): { label: string; cls: string } | null {
  if (status !== "surge" && status !== "up") return null; // 유지·하락·데이터없음 = 관망
  if (!confirmed) return { label: "신규 검색어", cls: "bg-mutedbg text-ink-3" }; // 검색광고에 아직 집계 안 됨(새로 뜨는 검색어, 노이즈 주의)
  // 그린은 "검색량으로 규모까지 확인된 상승"에만 쓴다.
  if (status === "surge") return { label: "트렌드", cls: "bg-rise text-ink" };
  return { label: "상승세", cls: "border border-ink text-ink" };
}

/** 점수 막대 — 상승은 그린, 그 외는 무채색. 그린은 방향을 말하는 색이다. */
function scoreBar(status: TrendStatus): string {
  if (status === "surge" || status === "up") return "#00C26A";
  return "#8A8676";
}

/**
 * 4주 추이 미니바 — 과거 → 현재.
 * 막대 색이 옅은 데서 잉크로 짙어지며 "가장 최근"이 어디인지 말한다.
 * ⚠️ 값이 4개 미만이면 그리지 않는다. 빈 칸을 0으로 채우면 없던 하락이 생긴다.
 */
function MiniTrend({ weeks, height }: { weeks: WeekPoint[] | undefined; height: number }) {
  const last4 = (weeks ?? []).slice(-4).map((w) => w.ratio);
  if (last4.length < 4) return <span className="text-[11px] text-ink-4">—</span>;
  const max = Math.max(...last4, 1);
  const tone = ["#E0DAC8", "#C9C4B2", "#8A8676", "#0B0B0A"];
  return (
    <span
      className="flex items-end gap-[3px] justify-self-end"
      style={{ height }}
      title={`4주 추이 ${last4.join(" → ")}`}
    >
      {last4.map((v, i) => (
        <span
          key={i}
          style={{
            width: 9,
            height: `${Math.max(8, Math.round((v / max) * 100))}%`,
            background: tone[i],
          }}
        />
      ))}
    </span>
  );
}

function DeltaCell({ v }: { v: number | null }) {
  const dir = v === null ? "flat" : v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
  const path =
    dir === "up" ? "M6 15l6-6 6 6" : dir === "down" ? "M6 9l6 6 6-6" : "M5 12h14";
  const stroke = dir === "up" ? "#00723F" : dir === "down" ? "#5C5849" : "#6E6B62";
  return (
    <span className={`inline-flex items-center gap-1 ${pctColor(v)}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.6">
        <path d={path} />
      </svg>
      <span className="cb-num text-[15px]">{formatPct(v)}</span>
    </span>
  );
}

/**
 * KPI 요약 바 — 큰 카드 4개를 쓰지 않는다.
 * 발굴 건수는 이 화면의 주 정보가 아니라 랭킹의 배경이라, 한 줄 인라인으로 낮춘다.
 */
function KpiItem({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <span className="whitespace-nowrap text-[13px] text-ink">
      {label} <span className="cb-num text-[16px]">{value}</span>
      {unit && <span className="text-[12px] text-ink-4">{unit}</span>}
    </span>
  );
}

const KpiSep = () => <span className="h-[14px] w-px bg-divider" />;

/**
 * 랭킹 표의 컬럼 격자 — 헤더·모든 티어 행이 **같은 값**을 써야 열이 맞는다.
 * 순위 / 상승률 / 키워드 / 월 검색량 / 상태 / 발굴점수 / 저장
 */
const ROW_GRID =
  "grid grid-cols-[44px_132px_1fr_92px_124px_128px_104px_76px] items-center gap-3";

/** TIER 3 을 칩으로 접어 둘 때 먼저 보여줄 개수. */
const TIER3_CHIPS = 8;

/**
 * 해외 랭킹의 컬럼 격자 — 국내와 같은 규격, 컬럼만 다르다.
 * 순위 / 급증 배수 / 키워드 / 영상수(채널) / 조회수(참고) / 저장
 */
const OS_ROW_GRID =
  "grid grid-cols-[44px_132px_1fr_132px_116px_76px] items-center gap-3";

/**
 * 해외 티어 문턱 — 디자인 명세 그대로 급증 배수 기준이다(×4 이상 / ×2~4 / ×2 미만).
 * ⚠️ 국내는 지표가 상승률(%)이라 기존 추세 판정으로 묶었지만, 해외는 지표 자체가 배수라
 *    명세의 숫자를 그대로 쓸 수 있다. 두 화면의 티어 이름이 같아도 근거는 이렇게 다르다.
 */
function overseasTier(lift: number): 1 | 2 | 3 {
  if (lift >= 4) return 1;
  if (lift >= 2) return 2;
  return 3;
}

/** 티어 밴드 — 표를 세 구획으로 나누는 가로 띠. */
function TierBand({
  tier,
  label,
  note,
  action,
}: {
  tier: 1 | 2 | 3;
  label: string;
  note: string;
  action?: React.ReactNode;
}) {
  const skin =
    tier === 1
      ? "bg-rise border-b-[1.5px] border-ink"
      : tier === 2
        ? "bg-mutedbg border-b-[1.5px] border-ink"
        : "bg-band3 border-b-[1.5px] border-ink";
  return (
    <div className={`flex items-center gap-[9px] px-4 py-[7px] ${skin}`}>
      <span className={`cb-tier ${tier === 3 ? "text-ink-3" : "text-ink"}`}>{label}</span>
      <span
        className={`text-[12px] font-semibold ${
          tier === 1 ? "text-rise-ink" : tier === 2 ? "text-ink-3" : "text-ink-4"
        }`}
      >
        {note}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** 랭킹 한 행. 티어에 따라 배경 밝기·글자 크기·괘선 굵기가 함께 움직인다. */
type RankedCandidate = Candidate & {
  rank: number;
  status: TrendStatus;
  confirmed: boolean;
  pattern: Parameters<typeof patternBonus>[0];
  streak: number;
  scoreParts: ScoreParts;
};

function RankRow({
  c,
  tier,
  maxScore,
  saved,
  onSave,
}: {
  c: RankedCandidate;
  tier: 1 | 2 | 3;
  maxScore: number;
  saved: boolean;
  onSave: () => void;
}) {
  const big = tier === 1;
  const tm = trendMark(c.status, c.confirmed);
  return (
    <div
      className={`${ROW_GRID} cb-row-hover px-4 ${
        big
          ? "border-b-[1.5px] border-ink bg-row1 py-[15px] hover:bg-row2"
          : "border-b border-hair bg-row2 py-[11px] hover:bg-mutedbg"
      }`}
    >
      <span className={`cb-num ${big ? "text-[16px] text-ink" : "text-[14px] !font-extrabold text-ink-3"}`}>
        {String(c.rank).padStart(2, "0")}
      </span>

      <span
        className={`cb-num whitespace-nowrap ${big ? "text-[24px] tracking-[-0.04em]" : "text-[18px] tracking-[-0.03em]"} ${
          c.riseRate !== null && c.riseRate < 0 ? "text-ink-3" : "text-ink"
        }`}
      >
        {formatPct(c.riseRate)}
      </span>

      <div className="min-w-0">
        <span className={big ? "text-[19px] font-black tracking-[-0.02em]" : "text-[15.5px] font-extrabold"}>
          {c.name}
        </span>
        {tm && (
          <span className={`ml-2 rounded-[3px] px-2 py-[2px] text-[10.5px] font-extrabold ${tm.cls}`}>
            {tm.label}
          </span>
        )}
        {shopGrade(c.shop) === "rising" && (
          <span
            title={`쇼핑 클릭도 상승 — 관심이 구매 의향까지 이어짐${
              c.shop?.riseRate != null ? ` (구매 +${Math.round(c.shop.riseRate)}%)` : ""
            }. 국내 트렌드 탭의 '삼중 확인'과 같은 신호.`}
            className="ml-1.5 cursor-help rounded-[3px] bg-rise px-2 py-[2px] text-[10.5px] font-extrabold text-ink"
          >
            구매 ↑
          </span>
        )}
        {c.source && (
          <span className={`ml-1.5 rounded-[3px] px-2 py-[2px] text-[10.5px] font-extrabold ${SOURCE_META[c.source].cls}`}>
            {SOURCE_META[c.source].label}
          </span>
        )}
        {c.contextTag === "nonfood" && (
          <span className="ml-1.5 rounded-[3px] border border-chip px-2 py-[2px] text-[10.5px] font-bold text-ink-3">
            비식품?
          </span>
        )}
      </div>

      <span className={`cb-num text-right ${big ? "text-[15px]" : "text-[13px]"} !font-extrabold text-ink`}>
        {c.volumeTotal > 0 ? formatCount(c.volumeTotal) : "—"}
      </span>

      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={c.status} />
        <PatternTag pattern={c.pattern} streak={c.streak} />
      </div>

      <div className="flex cursor-help items-center gap-2.5" title={scoreTitle(c.scoreParts, c.score)}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
          <div
            className="h-full rounded-[3px]"
            style={{
              width: `${Math.round((c.score / maxScore) * 100)}%`,
              background: scoreBar(c.status),
            }}
          />
        </div>
        <span className={`cb-num min-w-[24px] text-right ${big ? "text-[17px]" : "text-[15px]"}`}>
          {c.score}
        </span>
      </div>

      <MiniTrend weeks={c.weeks} height={big ? 26 : 22} />

      <div className="text-right">
        {saved ? (
          <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[4px] bg-rise px-2.5 text-[12px] font-extrabold text-ink">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            저장됨
          </span>
        ) : (
          <button
            onClick={onSave}
            className="cb-row-hover h-8 rounded-[4px] border-[1.5px] border-ink bg-transparent px-3 text-[12px] font-bold text-ink hover:bg-mutedbg"
          >
            저장
          </button>
        )}
      </div>
    </div>
  );
}

const ico = (path: string, sw = 2) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <path d={path} />
  </svg>
);

/**
 * 발굴점수 계산식 — 열 헤더 툴팁.
 * ⚠️ trend.ts 의 discoveryScore 와 같은 내용을 말해야 한다. 식을 바꾸면 이 문구도 바꿀 것.
 */
const SCORE_FORMULA = [
  "발굴점수 = 검색량 40% + 상승률 60% + 추세 패턴 보너스",
  "",
  "검색량은 로그 스케일로 정규화합니다 (큰 키워드 하나가 만점을 독식하지 않도록).",
  "상승률은 4주 흐름 — 최근 2주 평균 대비 이전 2주 평균 변화율입니다.",
  "추세 패턴 보너스: 연속 상승 +2점/주, 연속 하락 −2점/주 (최대 ±6).",
  "  반등·등락은 방향이 확정되지 않아 0점입니다.",
  "",
  "각 행의 점수 막대에 마우스를 올리면 그 키워드의 실제 계산이 보입니다.",
].join("\n");

/** 발굴점수 구성 — 화면에 "왜 이 점수인가"를 보여주기 위한 분해값. */
interface ScoreParts {
  /** 검색량 정규화 0~1 (로그 스케일) */
  vol: number;
  /** 상승률 정규화 0~1. 데이터가 없으면 중립값을 쓴다. */
  rise: number;
  /** 검색량 기여분(점) */
  volPart: number;
  /** 상승률 기여분(점) */
  risePart: number;
  /** 추세 패턴 보너스(±, 최대 ±6) */
  bonus: number;
  /** 학습된 신호 가중치 배수 (중립이면 1) */
  mult: number;
}

/** 상승률 데이터가 없을 때 쓰는 중립값 (trend.ts discoveryScore 와 동일). */
const RISE_NEUTRAL = 0.35;

/**
 * 점수 구성을 계산한다.
 *
 * ⚠️ trend.ts 의 discoveryScore 와 **같은 식**이어야 한다 — 어긋나면 화면 설명이 거짓말이 된다.
 *    (가중치 40/60 · 상승률 정규화 (rise+20)/70 · 패턴 보너스 주당 ±2, 최대 ±6)
 */
function scoreBreakdown(
  volume: number,
  maxVolume: number,
  riseRate: number | null,
  pattern: Parameters<typeof patternBonus>[0],
  streak: number,
  mult: number,
): ScoreParts {
  const vol = volumeNorm(volume, maxVolume);
  const rise =
    riseRate === null ? RISE_NEUTRAL : Math.max(0, Math.min(1, (riseRate + 20) / 70));
  return {
    vol,
    rise,
    volPart: 0.4 * vol * 100,
    risePart: 0.6 * rise * 100,
    bonus: patternBonus(pattern, streak),
    mult,
  };
}

/** 발굴점수 셀 툴팁 — 이 키워드가 왜 이 점수인지 숫자로 보여준다. */
function scoreTitle(parts: ScoreParts | undefined, score: number): string {
  if (!parts) return "발굴점수";
  const n = (x: number) => x.toFixed(1);
  const bonusLine =
    parts.bonus === 0
      ? "추세 패턴 보너스 0점 — 반등·등락은 방향이 불분명해 중립"
      : `추세 패턴 보너스 ${parts.bonus > 0 ? "+" : ""}${parts.bonus}점 — 연속 주당 ±2, 최대 ±6`;
  const multLine =
    parts.mult === 1
      ? null
      : `학습된 신호 가중치 ×${parts.mult.toFixed(2)} — 출처·신규여부 오탐률 반영`;
  return [
    `발굴점수 ${score}점 = 검색량 40% + 상승률 60% + 추세 패턴 보너스`,
    "",
    `검색량 40%  → ${n(parts.volPart)}점 (정규화 ${parts.vol.toFixed(2)} · 로그 스케일)`,
    `상승률 60%  → ${n(parts.risePart)}점 (정규화 ${parts.rise.toFixed(2)})`,
    bonusLine,
    multLine,
    "",
    "합계를 0~100 으로 잘라 반올림합니다.",
  ]
    .filter(Boolean)
    .join("\n");
}

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
  // TIER 3(침전) 표기 — 기본은 칩 메시, "표로 펼치기"로 TIER 2 와 같은 행이 된다.
  const [tier3Expanded, setTier3Expanded] = useState(false);
  const [tier3ShowAll, setTier3ShowAll] = useState(false);
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
        // 점수가 어떻게 나왔는지 화면에서 확인할 수 있게 구성을 함께 남긴다.
        // ⚠️ 위 score 와 **같은 입력**(maxVol·t·weights)으로 계산해야 설명과 값이 어긋나지 않는다.
        scoreParts: scoreBreakdown(
          c.volumeTotal,
          maxVol,
          t.riseRate,
          t.pattern,
          t.streak,
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

  /*
   * 티어 분류 — 새 문턱을 만들지 않는다. 기존 추세 판정(trend.ts)을 그대로 묶는다.
   *   급상승 → TIER 1 크림 / 상승 → TIER 2 우선 / 유지·하락·데이터없음 → TIER 3 침전
   * ⚠️ 정렬은 건드리지 않는다. 각 티어 안의 순서와 표시 순위(rank)는 전체 랭킹 그대로다.
   */
  const [tier1, tier2, tier3] = useMemo(() => {
    const t1: typeof filtered = [];
    const t2: typeof filtered = [];
    const t3: typeof filtered = [];
    for (const c of filtered) {
      if (c.status === "surge") t1.push(c);
      else if (c.status === "up") t2.push(c);
      else t3.push(c);
    }
    return [t1, t2, t3];
  }, [filtered]);

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
    const estimate = estimateUnits(seeds.length, overseasSeeds.length * nRegions);
    const okToRun = window.confirm(
      `키워드 발굴은 유튜브 API 쿼터를 씁니다.\n` +
        `국내 ${seeds.length}개 + 해외 ${overseasSeeds.length}개 시드(리전 ${nRegions}곳: ${OVERSEAS_REGIONS.join("·")})를 각각 조회합니다.\n` +
        `${quotaLine(estimate)}\n진행할까요?`,
    );
    if (!okToRun) return;
    addQuota(estimate);
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
      {/* PAGE HEADER — 화면 제목 + 주 동작. 브랜드명은 헤더가 이미 말하고 있다. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[700px]">
          <p className="cb-mono mb-[7px]">마지막 발굴 · {formatDateTime(lastDiscoveryAt)}</p>
          <h1 className="text-[40px] font-black leading-[1.05] tracking-[-0.045em] text-ink">
            현재 급상승 키워드
          </h1>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            <b className="font-bold text-ink">국내</b>는 유튜브 콘텐츠에서 신조어를 발굴하고, 그
            발굴어를 <b className="font-bold text-ink">네이버 검색 자동완성으로 확장</b>한 뒤{" "}
            <b className="font-bold text-ink">검색 급상승으로 검증</b>합니다.{" "}
            <b className="font-bold text-ink">해외(미국)</b>는 검색 소스가 없어{" "}
            <b className="font-bold text-ink">콘텐츠 급상승(lift)</b>만 봅니다. 한 번의 발굴로 아래
            두 랭킹이 함께 채워집니다.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={onRefreshData}
            disabled={refreshing}
            className="cb-row-hover flex items-center gap-1.5 rounded-[4px] border-2 border-ink px-[18px] py-3 text-[13px] font-bold text-ink hover:bg-mutedbg disabled:opacity-50"
          >
            {ico("M3 12a9 9 0 1 0 3-6.7L3 8")}
            검색 추이 갱신
          </button>
          <button
            onClick={onDiscover}
            disabled={discovering}
            title="유튜브 API 쿼터를 사용합니다 (시드 1개당 약 900 units)"
            className="cb-row-hover flex items-center gap-2 rounded-[4px] bg-ink px-5 py-[13px] text-[13px] font-extrabold text-on-dark hover:bg-ink-2 disabled:opacity-60"
          >
            {ico("m5 3 14 9-14 9V3z", 2.2)}
            {discovering ? "발굴 중…" : "키워드 발굴"}
            {!discovering && (
              <span className="cb-mono rounded-[3px] bg-on-dark/20 px-1.5 py-[1px] !text-[10px] !tracking-[0.1em] !text-on-dark">
                QUOTA
              </span>
            )}
          </button>
          <QuotaBadge />
        </div>
      </div>

      {/*
        KPI 요약 바 — 한 줄. 우측에는 티어 필터 칩을 붙인다.
        ⚠️ 필터는 아래 표의 티어 밴드와 같은 분류(급상승/상승/유지·하락)를 쓴다.
           둘이 어긋나면 "상승 8"을 눌렀는데 TIER 2 가 9줄인 화면이 나온다.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 rounded-[5px] border-[1.5px] border-ink bg-surface px-4 py-[11px]">
        {/* 이 수치들은 주 단위 집계가 아니라 **마지막 발굴 실행 기준**이라 "현재"로 적는다. */}
        <span className="cb-mono">현재</span>
        <KpiItem label="발굴 후보" value={String(enriched.length)} unit="개" />
        <KpiSep />
        <KpiItem label="저장 후보" value={String(keywords.length)} unit="개" />
        <KpiSep />
        <KpiItem label="상승 신호" value={String(counts.up)} unit="개" />
        <KpiSep />
        <KpiItem label="평균 발굴점수" value={avgScore} />
        {topCand && (
          <span className="whitespace-nowrap text-[12px] text-ink-4">
            최고 <span className="cb-num text-[13px] text-ink">{topCand.score}</span> ·{" "}
            {topCand.name}
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`cb-row-hover rounded-[3px] px-2.5 text-[12px] ${
                  active
                    ? "bg-rise py-1.5 font-extrabold text-ink"
                    : "border-[1.5px] border-chip py-[5px] font-bold text-ink-3 hover:bg-mutedbg"
                }`}
              >
                {f.label} {counts[f.key]}
              </button>
            );
          })}
        </span>
      </div>
      {/* SEED KEYWORDS */}
      <div className="mb-7 rounded-[5px] border-[1.5px] border-line bg-surface p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00723F" strokeWidth="2">
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
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[3px] border-[1.5px] border-ink bg-surface pl-3 pr-2 text-[13px] font-bold text-ink"
            >
              {s}
              <button
                onClick={() => setSeeds(seeds.filter((x) => x !== s))}
                className="cb-row-hover flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-ink-4 hover:bg-mutedbg hover:text-ink"
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
              className="h-[34px] w-[130px] rounded-[4px] border border-dashed border-[#8A8676] bg-surface px-3 text-[13px] font-semibold text-muted-strong outline-none placeholder:text-muted focus:border-accent-bright"
            />
          </form>
        </div>
      </div>

      {/* 콘텐츠 신호 없음 경고 — 유튜브 발굴 실패(쿼터) 시 자동완성 반쪽 결과임을 알림 */}
      {contentMissing && (
        <div className="mb-5 flex items-start gap-3 rounded-[5px] border border-[#0B0B0A] bg-[#E9E3D2] px-4 py-3.5 text-[13.5px] leading-relaxed text-[#5C5849]">
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[24px] font-black tracking-[-0.02em] text-ink">국내 발굴 랭킹</h2>
          <span className="text-[12px] font-bold text-ink-3">
            유튜브 발굴 · 검색 검증 · 후보 {enriched.length}개
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "rise" | "score")}
            title="랭킹 정렬 기준"
            className="h-9 rounded-[4px] border-[1.5px] border-ink bg-surface px-2.5 text-[12.5px] font-bold text-ink outline-none"
          >
            <option value="rise">상승률순</option>
            <option value="score">발굴점수순</option>
          </select>
          <div className="flex h-9 w-[200px] items-center gap-2 rounded-[4px] border-[1.5px] border-ink bg-surface px-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E6B62" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="키워드 필터"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-4"
            />
          </div>
        </div>
      </div>

      {/* 점수 산식 안내 — 랭킹이 어떤 근거로 매겨졌는지 표 위에서 바로 보이게 한다. */}
      {enriched.length > 0 && (
        <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
          <b className="font-bold text-ink">발굴점수</b> = 검색량 40% + 상승률 60% + 추세 패턴 보너스.{" "}
          <span title={SCORE_FORMULA} className="cursor-help underline decoration-dotted">
            추세 패턴 보너스
          </span>
          는 연속 상승 +2점/주 · 연속 하락 −2점/주(최대 ±6)이고, 반등·등락은 방향이 확정되지 않아
          0점입니다. 점수 막대에 마우스를 올리면 그 키워드의 실제 계산이 보입니다.{" "}
          <b className="font-bold text-ink">정렬</b>은 상승률 기준이며, 구매 의향(쇼핑)은 함께
          표시만 하고 점수에는 넣지 않습니다.
        </p>
      )}

      {msg && (
        <div
          className={`mb-3 rounded-[4px] border-[1.5px] border-ink px-4 py-3 text-[13px] ${
            msg.kind === "error" ? "bg-mutedbg text-ink" : "bg-rise text-ink"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/*
        RANKING TABLE — 티어 밴드 표.
        크림보드의 서사("크림은 위로 뜬다")를 화면에 옮기는 유일한 장치다:
          TIER 1 크림(급상승) · TIER 2 우선(상승세) · TIER 3 침전(유지·하락).
        ⚠️ 티어는 새 문턱을 만들지 않고 기존 추세 판정(trend.ts)을 그대로 묶은 것이다.
           행 크기·배경 밝기·괘선 굵기가 전부 티어를 따라간다 — 위로 갈수록 밝고 크다.
      */}
      <div className="mb-11 overflow-hidden rounded-[5px] border-2 border-ink">
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
          <div className="nt-scroll max-h-[720px] overflow-auto">
            {/* 표 헤더 — 잉크 면 위 mono 라벨 */}
            <div className={`${ROW_GRID} sticky top-0 z-[2] bg-ink px-4 py-[9px]`}>
              <span className="cb-th">#</span>
              <span className="cb-th">상승률</span>
              <span className="cb-th">키워드</span>
              <span className="cb-th text-right">월 검색량</span>
              <span className="cb-th">상태</span>
              <span className="cb-th" title={SCORE_FORMULA}>
                발굴점수
              </span>
              <span className="cb-th text-right">4주 추이</span>
              <span className="cb-th text-right">저장</span>
            </div>

            {tier1.length > 0 && (
              <>
                <TierBand
                  tier={1}
                  label="TIER 1 · 크림 — 급상승"
                  note={`즉시 검토 ${tier1.length}건`}
                />
                {tier1.map((c) => (
                  <RankRow key={c.name} c={c} tier={1} maxScore={maxScore} saved={savedNames.has(c.name)} onSave={() => saveCandidate(c, saveCategory)} />
                ))}
              </>
            )}

            {tier2.length > 0 && (
              <>
                <TierBand
                  tier={2}
                  label="TIER 2 · 우선 — 상승세"
                  note={`${tier2.length}건 · 다음 크림 후보`}
                />
                {tier2.map((c) => (
                  <RankRow key={c.name} c={c} tier={2} maxScore={maxScore} saved={savedNames.has(c.name)} onSave={() => saveCandidate(c, saveCategory)} />
                ))}
              </>
            )}

            {tier3.length > 0 && (
              <>
                <TierBand
                  tier={3}
                  label="TIER 3 · 침전 — 유지·하락"
                  note={`${tier3.length}건`}
                  action={
                    <button
                      onClick={() => setTier3Expanded((v) => !v)}
                      className="cb-row-hover rounded-[3px] border-[1.5px] border-ink px-2.5 py-1 text-[12px] font-bold text-ink hover:bg-mutedbg"
                    >
                      {tier3Expanded ? "칩으로 접기" : "표로 펼치기"}
                    </button>
                  }
                />
                {tier3Expanded ? (
                  tier3.map((c) => (
                    <RankRow key={c.name} c={c} tier={3} maxScore={maxScore} saved={savedNames.has(c.name)} onSave={() => saveCandidate(c, saveCategory)} />
                  ))
                ) : (
                  <div className="flex flex-wrap gap-1.5 bg-surface px-4 py-[13px]">
                    {(tier3ShowAll ? tier3 : tier3.slice(0, TIER3_CHIPS)).map((c) => (
                      <span
                        key={c.name}
                        className="rounded-[3px] border border-divider px-2.5 py-1.5 text-[12.5px] text-ink-2"
                      >
                        {c.name}{" "}
                        <span className="font-mono text-ink-4">{formatPct(c.riseRate)}</span>
                      </span>
                    ))}
                    {!tier3ShowAll && tier3.length > TIER3_CHIPS && (
                      <button
                        onClick={() => setTier3ShowAll(true)}
                        className="cb-row-hover rounded-[3px] border border-ink px-2.5 py-1.5 text-[12.5px] font-bold text-ink hover:bg-mutedbg"
                      >
                        +{tier3.length - TIER3_CHIPS}건 더 보기
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
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
            className="flex h-9 items-center gap-1.5 rounded-[4px] border border-[#C9C4B2] bg-surface px-3.5 text-[12.5px] font-semibold text-muted-strong transition-colors hover:border-[#8A8676] hover:text-foreground disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            YouTube 신호 갱신
            <span className="ml-0.5 rounded bg-[#E9E3D2] px-1.5 py-[1px] text-[10px] font-bold text-[#5C5849]">
              쿼터
            </span>
          </button>
        </div>
      </div>

      {wlMsg && (
        <div
          className={`mb-3.5 rounded-[5px] px-4 py-3 text-sm ${
            wlMsg.kind === "error" ? "bg-down-soft text-down" : "bg-rise text-ink"
          }`}
        >
          {wlMsg.text}
        </div>
      )}

      {watchlist.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[4px] border-[1.5px] border-ink bg-surface px-4 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00723F" strokeWidth="2">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <span className="text-[13px] font-bold text-ink">
            YouTube 신호 · {ytCount}개 수집
          </span>
        </div>
      )}

      {watchlist.length === 0 ? (
        <div className="rounded-[5px] border border-dashed border-[#8A8676] bg-surface px-4 py-10 text-center text-sm text-muted">
          발굴 랭킹에서 유망 키워드를 <b className="font-semibold text-muted-strong">저장</b>하면
          여기에서 검색 추이·YouTube 신호로 교차 검증할 수 있습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[5px] border-[1.5px] border-line bg-surface shadow-[0_1px_2px_rgba(35,33,28,0.03)]">
          <div className="nt-scroll overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-ink">
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
                    <tr key={k.id} className="border-t border-line-soft hover:bg-[#FCFAF3]">
                      <td className="py-[15px] pl-6 pr-4 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/keywords/${k.id}`} className="hover:text-accent-ink hover:underline">
                            {k.name}
                          </Link>
                          <button
                            onClick={() => deleteKeyword(k.id)}
                            title="저장 목록에서 삭제"
                            aria-label={`${k.name} 삭제`}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-muted transition-colors hover:bg-down-soft hover:text-down"
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
                      <td className="px-4 py-[15px] text-right font-semibold tabular-nums text-[#0B0B0A]">
                        {k.youtube ? formatCount(k.youtube.videoCount) : "—"}
                      </td>
                      <td className="px-4 py-[15px] text-right font-semibold tabular-nums text-[#0B0B0A]">
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
                                  ? `"${k.name}" → ${type} 제조 이력이 있는 제조처 찾기`
                                  : `"${k.name}" 제조처 찾기 (제조처 화면에서 유형 선택)`
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border-[1.5px] border-line px-2.5 py-1.5 text-xs font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:bg-rise hover:text-ink"
                            >
                              제조처
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
        크림보드 · MVP · 데이터: 네이버 검색광고·데이터랩 · YouTube
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
      className={`cb-th px-4 py-[9px] ${title ? "cursor-help" : ""} ${className}`}
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[5px] bg-[#E9E3D2]">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6E6B62" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
      </div>
      <div className="mb-1.5 text-[15px] font-bold text-[#0B0B0A]">{title}</div>
      <div className="max-w-[340px] text-[13px] leading-relaxed text-muted">{desc}</div>
      {onReset && (
        <button
          onClick={onReset}
          className="mt-4 h-[38px] rounded-[4px] border-[1.5px] border-line bg-surface px-4 text-[13px] font-semibold text-accent transition-colors hover:border-accent-bright hover:bg-[#E9E3D2]"
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
      <div className="h-9 w-64 animate-pulse rounded-[3px] bg-[#E9E3D2]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[5px] bg-[#E9E3D2]" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-[5px] bg-[#E9E3D2]" />
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

  /*
   * 티어로 묶는다 — 순서는 위 정렬 그대로다(채널 표본이 충분한 것이 먼저, 그다음 배수순).
   * 표시 순위(rank)도 티어와 무관한 전체 순위라, 국내 표와 읽는 법이 같다.
   */
  const ranked = sorted.map((c, i) => ({ ...c, rank: i + 1 }));
  const OS_TIERS = [
    { tier: 1 as const, label: "TIER 1 · 크림 — ×4 이상", rows: ranked.filter((c) => overseasTier(c.lift) === 1) },
    { tier: 2 as const, label: "TIER 2 · 우선 — ×2~4", rows: ranked.filter((c) => overseasTier(c.lift) === 2) },
    { tier: 3 as const, label: "TIER 3 · 침전 — ×2 미만", rows: ranked.filter((c) => overseasTier(c.lift) === 3) },
  ];

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
          <span className="rounded-[3px] bg-[#E9E3D2] px-2 py-[3px] text-[11px] font-bold text-[#4A463C]">
            {OVERSEAS_REGIONS.join("·")}
          </span>
          {candidates.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-rise px-2.5 py-1 text-xs font-semibold text-ink">
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
      <div className="mb-3.5 rounded-[5px] border-[1.5px] border-line bg-surface p-4">
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
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] border border-[#C9C4B2] bg-[#E9E3D2] pl-3 pr-2 text-[12.5px] font-semibold text-[#4A463C]"
            >
              {s}
              <button
                onClick={() => setSeeds(seeds.filter((x) => x !== s))}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-[#6E6B62] transition-colors hover:bg-[#C9C4B2] hover:text-[#4A463C]"
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
              className="h-[32px] w-[150px] rounded-[4px] border border-dashed border-[#8A8676] bg-surface px-3 text-[12.5px] font-semibold text-muted-strong outline-none placeholder:text-muted focus:border-[#8A8676]"
            />
          </form>
        </div>
      </div>

      {/*
        해외 랭킹도 국내와 같은 티어 밴드 표를 쓴다.
        ⚠️ 여기서는 티어 문턱이 스펙 그대로다 — 급증 배수 ×4 이상 / ×2~4 / ×2 미만.
           국내는 지표가 상승률(%)이라 추세 판정으로 묶었지만, 해외는 지표 자체가 배수라
           디자인 명세의 기준을 그대로 쓸 수 있다.
        ⚠️ TIER 3 을 칩으로 접지 않는다 — 국내와 달리 행마다 '저장' 버튼이 달려 있어
           접으면 침전 후보를 저장할 방법이 사라진다. 목록도 짧아 접을 이유가 없다.
      */}
      <div className="overflow-hidden rounded-[5px] border-2 border-ink">
        {candidates.length === 0 ? (
          <EmptyBlock
            title="아직 해외 발굴 결과가 없습니다"
            desc="위의 발굴 실행을 누르면 국내와 함께 미국(US) 콘텐츠 급상승 키워드가 채워집니다."
          />
        ) : (
          <div className="nt-scroll max-h-[640px] overflow-auto">
            <div className={`${OS_ROW_GRID} sticky top-0 z-[2] bg-ink px-4 py-[9px]`}>
              <span className="cb-th">#</span>
              <span className="cb-th">급증 배수</span>
              <span className="cb-th">키워드</span>
              <span
                className="cb-th text-right"
                title="최근 이 말이 제목에 등장한 영상 수. 괄호 안은 그 영상이 퍼진 채널 수 — 한 채널이 여러 영상을 올려도 채널 수는 1로 셉니다."
              >
                영상수 (채널)
              </span>
              <span className="cb-th text-right" title="점수에는 반영하지 않는 참고용 조회수 합">
                조회수 (참고)
              </span>
              <span className="cb-th text-right">저장</span>
            </div>

            {OS_TIERS.map(({ tier, label, rows }) =>
              rows.length === 0 ? null : (
                <div key={tier}>
                  <TierBand tier={tier} label={label} note={`${rows.length}건`} />
                  {rows.map((c) => {
                    const term = c.term.replace(/^#/, "");
                    const big = tier === 1;
                    const fewChannels = c.dfRecent < MIN_OVERSEAS_CHANNELS;
                    return (
                      <div
                        key={c.term}
                        className={`${OS_ROW_GRID} cb-row-hover px-4 ${
                          big
                            ? "border-b-[1.5px] border-ink bg-row1 py-[15px] hover:bg-row2"
                            : "border-b border-hair bg-row2 py-[11px] hover:bg-mutedbg"
                        }`}
                      >
                        <span
                          className={`cb-num ${
                            big ? "text-[16px] text-ink" : "text-[14px] !font-extrabold text-ink-3"
                          }`}
                        >
                          {String(c.rank).padStart(2, "0")}
                        </span>

                        <span
                          className={`cb-num whitespace-nowrap text-ink ${
                            big ? "text-[24px] tracking-[-0.04em]" : "text-[18px] tracking-[-0.03em]"
                          }`}
                        >
                          ×{c.lift}
                        </span>

                        <div className="min-w-0">
                          <span
                            className={
                              big
                                ? "text-[19px] font-black tracking-[-0.02em]"
                                : "text-[15.5px] font-extrabold"
                            }
                          >
                            {c.term}
                          </span>
                          {fewChannels && (
                            <span
                              title={`최근 ${c.dfRecent}개 채널만 사용 — 표본이 작아 트렌드로 보기 이릅니다.`}
                              className="ml-2 cursor-help rounded-[3px] bg-mutedbg px-2 py-[2px] text-[10.5px] font-bold text-ink-3"
                            >
                              채널 소량
                            </span>
                          )}
                          {c.novel && (
                            <span
                              title="과거 기준선의 어느 채널도 쓰지 않다가 최근 처음 등장한 용어입니다. 진짜 신조어 여부는 별개 — 표본에 없던 일반어도 포함될 수 있습니다."
                              className="ml-1.5 cursor-help rounded-[3px] bg-mutedbg px-2 py-[2px] text-[10.5px] font-bold text-ink-3"
                            >
                              신규 등장
                            </span>
                          )}
                          {c.contextTag === "nonfood" && (
                            <span
                              title={`게임·챌린지 등 비식품 맥락일 수 있습니다 (식품어 포함 ${Math.round((c.foodShare ?? 0) * 100)}%).`}
                              className="ml-1.5 cursor-help rounded-[3px] border border-chip px-2 py-[2px] text-[10.5px] font-bold text-ink-3"
                            >
                              비식품?
                            </span>
                          )}
                          {c.examples?.length > 0 && (
                            <p
                              className="mt-1 truncate text-[11px] text-ink-4"
                              title={c.examples.join("  ·  ")}
                            >
                              예: {c.examples[0]}
                            </p>
                          )}
                        </div>

                        <span className="text-right">
                          <span
                            className={`cb-num text-ink ${big ? "text-[15px]" : "text-[13px]"}`}
                          >
                            {formatCount(c.videosRecent ?? c.dfRecent)}
                          </span>
                          <span className="ml-1 text-[11.5px] text-ink-4">({c.dfRecent})</span>
                        </span>

                        <span
                          className={`cb-num text-right text-ink-3 ${big ? "text-[15px]" : "text-[13px]"}`}
                        >
                          {formatCount(c.views)}
                        </span>

                        <div className="text-right">
                          {savedNames.has(term) ? (
                            <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[4px] bg-rise px-2.5 text-[12px] font-extrabold text-ink">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              저장됨
                            </span>
                          ) : (
                            <button
                              onClick={() => onSave(c)}
                              className="cb-row-hover h-8 rounded-[4px] border-[1.5px] border-ink bg-transparent px-3 text-[12px] font-bold text-ink hover:bg-mutedbg"
                            >
                              저장
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
