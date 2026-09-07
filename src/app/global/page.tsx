"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchGlobal,
  fetchDiscover,
  GLOBAL_REGIONS,
  SEED_PRESETS,
  type GlobalResult,
  type DiscoverResult,
  type DiscoverCandidate,
  type DiscoverReaction,
} from "@/lib/global";
import { useStore } from "@/lib/store-context";
import { localeForRegion } from "@/lib/lang";
import { fetchReddit, type RedditResult } from "@/lib/reddit";
import { MIN_DOC_HITS } from "@/lib/reasons";
import { formatCount } from "@/lib/format";
import { judgeOverseasInflow, type InflowRow } from "@/lib/inflow-client";
import { mergeOverseasSources, sourceBadges, BADGE_META, type OverseasSource } from "@/lib/overseas-sources";
import { fetchFoodNews, type NewsTerm } from "@/lib/trend-radar";
import { INFLOW_META, INFLOW_RANK, INFLOW_GROUP, GROUP_META, type InflowGroup } from "@/lib/inflow";
import { estimateUnits, quotaLine, addQuota } from "@/lib/quota";
import { QuotaBadge } from "@/components/QuotaBadge";

type Mode = "discover" | "analyze";

/**
 * 유입 상태 배지 색 — **3분류**만 구분한다.
 * "기획 시점"만 눈에 띄게 하고, 나머지는 조용히 둔다.
 */
const GROUP_STYLE: Record<InflowGroup, string> = {
  opportunity: "bg-accent text-white",
  candidate: "border border-line text-muted-strong",
  mature: "bg-[#f0eee9] text-muted",
  unknown: "border border-dashed border-line text-muted",
};

/**
 * 국내 유입 상태 셀.
 *
 * 화면에는 3분류(기회·후보·성숙)만 띄우고, **구체적인 사유는 툴팁**에 남긴다
 * — 내부적으로는 5개 상태를 구분하지만(도착 완료 vs 지연 유입 등) 표에 다 내면
 * 무엇을 해야 할지 판단하기 어려워진다.
 */
function inflowCell(row: InflowRow | undefined, loading: boolean) {
  if (!row) {
    return <span className="text-[11px] text-muted">{loading ? "판정 중…" : "—"}</span>;
  }
  const group = INFLOW_GROUP[row.status];
  const groupMeta = GROUP_META[group];
  const detail = INFLOW_META[row.status];
  const rise =
    row.riseRate == null ? null : `${row.riseRate > 0 ? "+" : ""}${row.riseRate.toFixed(0)}%`;
  const title = [
    groupMeta.desc,
    "",
    `세부: ${detail.label} — ${detail.desc}`,
    row.spelling
      ? `국내 검색어: ${row.spelling}${row.verified ? " (자동완성 확인)" : " (미검증 표기)"}`
      : null,
    rise ? `국내 상승률 ${rise}` : null,
    row.volumeTotal ? `월 검색량 ${row.volumeTotal.toLocaleString()}` : null,
  ]
    .filter((v) => v !== null)
    .join("\n");
  return (
    <span className="cursor-help" title={title}>
      <span
        className={`inline-flex rounded-full px-2 py-[2px] text-[10.5px] font-bold ${GROUP_STYLE[group]}`}
      >
        {groupMeta.label}
      </span>
      {row.spelling && (
        <span className="ml-1.5 text-[11px] text-muted">
          {row.spelling}
          {rise && group !== "mature" ? ` ${rise}` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * 조회/구독 비율 표시. 쇼츠와 롱폼을 **합치지 않는다** — 쇼츠는 비구독자에게 배포돼
 * 비율이 구조적으로 커서 같은 잣대로 못 본다. 롱폼이 있으면 롱폼을, 없으면 쇼츠를 보여준다.
 */
function formatRatio(r: DiscoverReaction | undefined): string {
  if (!r || !r.sampled) return "—";
  const long = r.viewPerSubLong;
  const short = r.viewPerSubShort;
  const v = long ?? short;
  if (v == null) return "—";
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}x${long == null ? " (쇼츠)" : ""}`;
}

/** 비율 셀 툴팁 — 표본 수와 나머지 반응 지표를 함께 보여준다. */
function reactionTitle(r: DiscoverReaction | undefined): string {
  if (!r || !r.sampled) return "구독자를 공개한 채널 표본이 없어 계산하지 못했습니다.";
  const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`);
  const ratio = (x: number | null) => (x == null ? "—" : `${x < 10 ? x.toFixed(1) : Math.round(x)}x`);
  return [
    `조회/구독 중앙값 — 롱폼 ${ratio(r.viewPerSubLong)} · 쇼츠 ${ratio(r.viewPerSubShort)}`,
    `좋아요율 ${pct(r.likeRate)} · 댓글율 ${pct(r.commentRate)}`,
    `표본 ${r.sampled}건 (구독자 100명 미만 채널은 제외)`,
    "",
    "참고 지표입니다 — 순위는 여전히 채널 확산(급증 배수)으로만 매깁니다.",
  ].join("\n");
}

export default function GlobalPage() {
  const [mode, setMode] = useState<Mode>("discover");
  const [region, setRegion] = useState("US");

  // 발굴 — 미국(US)은 대시보드 발굴과 공유한다(한 번 발굴로 대시보드·해외 트렌드 함께 채움).
  const { overseasCandidates } = useStore();
  const [seedText, setSeedText] = useState(SEED_PRESETS.en.join(", "));
  const [discover, setDiscover] = useState<DiscoverResult | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [foodFirst, setFoodFirst] = useState(true);
  /** 해외 후보의 국내 유입 판정. 유튜브 쿼터를 쓰지 않아 발굴 직후 자동으로 돌린다. */
  const [inflow, setInflow] = useState<Record<string, InflowRow>>({});
  const [inflowLoading, setInflowLoading] = useState(false);
  /** 유튜브에는 없고 해외 매체에서만 나온 후보 수 — 표 위 안내에 쓴다. */
  const [mediaOnly, setMediaOnly] = useState(0);

  // 대시보드에서 발굴한 US 결과(store)를 이 탭 발굴 뷰에 반영. 여기서 직접 돌리기 전까지 공유 결과를 보여준다.
  useEffect(() => {
    if (region === "US" && !discover && overseasCandidates.length) {
      setDiscover({
        region: "US",
        locale: "en",
        seeds: SEED_PRESETS.en,
        window: { recentDays: 30, baselineStartDays: 365, baselineEndDays: 90 },
        counts: { recentDocs: 0, baselineDocs: 0, recentChannels: 0, baselineChannels: 0, droppedByLang: 0, terms: overseasCandidates.length },
        quotaUnits: 0,
        candidates: overseasCandidates,
      });
    }
  }, [overseasCandidates, region, discover]);

  // 서버는 식품 맥락 우선으로 정렬해 보낸다. 끄면 순수 급증순으로 되돌린다.
  // 후보가 새로 뽑히면 **해외 식품 매체 스캔을 함께 돌려 합친 뒤** 국내 유입을 판정한다.
  // (표기 변환 → 데이터랩 → 검색광고). 유튜브 쿼터와 무관하고, 매체 스캔이 실패해도
  // 유튜브 후보만으로 진행한다.
  useEffect(() => {
    const list = discover?.candidates ?? [];
    if (!list.length) {
      setInflow({});
      setMediaOnly(0);
      return;
    }
    let cancelled = false;
    setInflowLoading(true);

    (async () => {
      // 해외 매체는 **해외 피드만** 본다 — 국내 전문지를 섞으면 후보가 한국 기사
      // 상투어(추석·영업자)로 뒤덮인다.
      let mediaTerms: NewsTerm[] = [];
      try {
        const news = await fetchFoodNews("overseas");
        mediaTerms = news.terms;
      } catch {
        // 매체 스캔 실패는 무시 — 유튜브 후보만으로 랭킹을 만든다.
      }
      const merged = mergeOverseasSources(list, mediaTerms);
      if (cancelled) return;
      setMediaOnly(merged.filter((m) => m.source !== "youtube").length);
      const rows = await judgeOverseasInflow(merged);
      if (!cancelled) setInflow(Object.fromEntries(rows.map((r) => [r.term, r])));
    })()
      .catch(() => {
        if (!cancelled) setInflow({});
      })
      .finally(() => {
        if (!cancelled) setInflowLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [discover]);

  /**
   * 표에 그릴 행 — 유튜브 후보와 **매체 단독 후보**를 합친다.
   * 매체 단독 후보는 유튜브 지표가 없으므로 `cand: null` 로 두고, 그 칸들은 "—" 로 비운다.
   */
  const rankedCandidates = useMemo(() => {
    const list = discover?.candidates ?? [];
    const rows: { term: string; source: OverseasSource; cand: DiscoverCandidate | null }[] =
      list.map((c) => ({ term: c.term, source: inflow[c.term]?.source ?? "youtube", cand: c }));

    // 유입 판정에만 있고 유튜브 후보에는 없는 것 = 매체에서만 잡힌 말.
    const seen = new Set(list.map((c) => c.term));
    for (const r of Object.values(inflow)) {
      if (!seen.has(r.term)) rows.push({ term: r.term, source: r.source, cand: null });
    }

    if (!foodFirst) {
      return rows.sort(
        (a, b) => (b.cand?.lift ?? 0) - (a.cand?.lift ?? 0) || (b.cand?.dfRecent ?? 0) - (a.cand?.dfRecent ?? 0),
      );
    }
    // 유입 판정이 붙었으면 **"기회"를 맨 위로**. 이게 이 화면이 답하려는 질문이다 —
    // "해외에서 뜨는 것" 이 아니라 "해외에서 떴고 국내로 들어오는 중인 것".
    if (!Object.keys(inflow).length) return rows;
    return rows.sort((a, b) => {
      const ra = inflow[a.term] ? INFLOW_RANK[inflow[a.term].status] : -1;
      const rb = inflow[b.term] ? INFLOW_RANK[inflow[b.term].status] : -1;
      return rb - ra || (inflow[b.term]?.score ?? 0) - (inflow[a.term]?.score ?? 0);
    });
  }, [discover, foodFirst, inflow]);

  // 분석
  const [keyword, setKeyword] = useState("dubai chocolate");
  const [data, setData] = useState<GlobalResult | null>(null);
  const [reddit, setReddit] = useState<RedditResult | null>(null);
  const [redditNote, setRedditNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionMeta = GLOBAL_REGIONS.find((g) => g.code === region);

  function changeRegion(code: string) {
    setRegion(code);
    const preset = SEED_PRESETS[localeForRegion(code)];
    if (preset) setSeedText(preset.join(", "));
  }

  async function runDiscover(e: React.FormEvent) {
    e.preventDefault();
    const seeds = seedText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (!seeds.length) return;
    const estimate = estimateUnits(0, seeds.length);
    const okToRun = window.confirm(
      `키워드 발굴은 유튜브 API 쿼터를 씁니다.\n` +
        `시드 ${seeds.length}개를 각각 조회합니다.\n` +
        `${quotaLine(estimate)}\n진행할까요?`,
    );
    if (!okToRun) return;
    addQuota(estimate);
    setDiscovering(true);
    setDiscoverError(null);
    try {
      setDiscover(await fetchDiscover(seeds, region));
    } catch (err) {
      setDiscover(null);
      setDiscoverError(err instanceof Error ? err.message : "발굴에 실패했습니다.");
    } finally {
      setDiscovering(false);
    }
  }

  async function analyzeTerm(term: string) {
    setMode("analyze");
    setKeyword(term);
    setLoading(true);
    setError(null);
    setReddit(null);
    setRedditNote(null);
    try {
      setData(await fetchGlobal(term, region));
      try {
        setReddit(await fetchReddit(term));
      } catch (err) {
        setRedditNote(err instanceof Error ? err.message : "Reddit 미설정");
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const r = data?.reasons;
  const activeReasons = r?.categories.filter((c) => c.docHits > 0) ?? [];

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">해외 트렌드</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            MVP
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          해외엔 절대 검색량 소스가 없습니다. 그래서{" "}
          <b className="font-medium">검색량 급상승</b> 대신{" "}
          <b className="font-medium">콘텐츠 급상승</b>을 봅니다 — 최근 조회수가 터진 영상에서만
          갑자기 튀어나온 용어를 <b className="font-medium">과거 기준선과 비교(lift)</b>해 신조어를
          잡아냅니다.
        </p>
      </header>

      {/* 모드 · 국가 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[10px] border border-line bg-white p-1">
          {(
            [
              ["discover", "① 키워드 발굴"],
              ["analyze", "② 신호 분석"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-bold transition-colors ${
                mode === m ? "bg-accent text-white" : "text-muted hover:text-muted-strong"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={region}
          onChange={(e) => changeRegion(e.target.value)}
          className="h-10 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold outline-none focus:border-accent-bright"
        >
          {GLOBAL_REGIONS.map((g) => (
            <option key={g.code} value={g.code}>
              {g.label} ({g.code})
            </option>
          ))}
        </select>
      </div>

      {regionMeta?.note && (
        <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-xs leading-relaxed text-[#8a6a00]">
          <b className="font-bold">{regionMeta.label} 주의</b> — {regionMeta.note}
        </div>
      )}

      {mode === "discover" ? (
        <>
          <form
            onSubmit={runDiscover}
            className="rounded-2xl border border-line bg-white p-4"
          >
            <label className="mb-2 block text-[12.5px] font-semibold text-muted-strong">
              시드 카테고리 <span className="font-normal text-muted">(쉼표 구분 · 최대 4개)</span>
            </label>
            <p className="mb-2.5 text-xs text-muted">
              카테고리에 <b className="font-semibold text-muted-strong">의도어</b>(viral · trending · new)를
              꼭 붙이세요. <code className="rounded bg-[#f0eee9] px-1">dessert</code> 만 넣으면 신규 업로드가
              무작위라 트렌드가 안 잡히고,{" "}
              <code className="rounded bg-[#f0eee9] px-1">viral dessert</code> 로 바꾸면 같은 조건에서 5배 넘게
              잡힙니다.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="viral dessert, trending snack, new bakery"
                className="h-10 flex-1 min-w-[260px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
              />
              <button
                type="submit"
                disabled={discovering}
                title="유튜브 API 쿼터를 사용합니다 (시드 1개당 약 900 units)"
                style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
                className="flex h-10 items-center gap-2 rounded-[10px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
              >
                {discovering ? "발굴 중…" : "키워드 발굴"}
                {!discovering && (
                  <span className="rounded bg-white/20 px-1.5 py-[1px] text-[10px] font-bold text-white">
                    쿼터
                  </span>
                )}
              </button>
              <QuotaBadge />
            </div>
            <p className="mt-2.5 text-xs text-muted">
              시드당 <b className="font-semibold">최근 14일</b>의 신규 업로드와{" "}
              <b className="font-semibold">3~12개월 전</b> 기준선을 받아 비교합니다. 기준선은 하루 캐시되어
              두 번째 발굴부터는 쿼터를 절반만 씁니다.
            </p>
          </form>

          {discoverError && (
            <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{discoverError}</div>
          )}

          {!discover ? (
            <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-16 text-center text-sm text-muted">
              시드 카테고리를 넣고{" "}
              <b className="font-semibold text-muted-strong">키워드 발굴</b>을 눌러보세요.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="후보 키워드" value={String(discover.candidates.length)} sub={`전체 용어 ${formatCount(discover.counts.terms)}개 중`} />
                <Kpi label="최근 채널" value={String(discover.counts.recentChannels)} sub={`영상 ${discover.counts.recentDocs}건 · 최근 ${discover.window.recentDays}일`} />
                <Kpi label="기준선 채널" value={String(discover.counts.baselineChannels)} sub={`영상 ${discover.counts.baselineDocs}건 · ${discover.window.baselineEndDays}~${discover.window.baselineStartDays}일 전`} />
                <Kpi label="쿼터 사용" value={`${discover.quotaUnits}`} sub={`units · 타언어 ${discover.counts.droppedByLang}건 제외`} />
              </div>

              {discover.counts.baselineChannels < 200 && (
                <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-xs leading-relaxed text-[#8a6a00]">
                  <b className="font-bold">기준선이 작습니다</b> — {discover.counts.baselineChannels}개 채널.
                  흔한 단어까지 &ldquo;과거 0건&rdquo;으로 잡혀 <b className="font-bold">신조어 판정이 불안정</b>합니다.
                  시드를 늘리면 기준선이 함께 커집니다. (권장 200채널 이상)
                </div>
              )}

              <section className="rounded-2xl border border-line bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-muted-strong">
                    해외 급상승 후보 <span className="font-normal text-muted">(급증 배수 순)</span>
                  </h2>
                  <span className="text-xs text-muted">최근 {discover.window.recentDays}일 · {discover.region}</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f6f1] px-3 py-2">
                  <p className="text-xs text-muted">
                    <b className="font-semibold text-muted-strong">식품 맥락 우선</b> — 식품어와 함께 나온 후보는
                    위로, 게임·챌린지 맥락은 아래로. <b className="font-semibold text-muted-strong">아무것도
                    제거하지 않습니다</b> (신조어가 죽지 않도록).
                  </p>
                  <div className="inline-flex shrink-0 rounded-lg border border-line bg-white p-0.5">
                    {(
                      [
                        [true, "식품 맥락 우선"],
                        [false, "순수 급증순"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={label}
                        onClick={() => setFoodFirst(v)}
                        className={`rounded-md px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
                          foodFirst === v ? "bg-accent text-white" : "text-muted hover:text-muted-strong"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {discover.candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">
                    후보를 찾지 못했습니다. 시드를 넓히거나 기간을 늘려보세요.
                  </p>
                ) : (
                  <div className="nt-scroll overflow-x-auto">
                    <table className="w-full min-w-[960px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-muted">
                          <th className="w-12 py-2.5 font-semibold">#</th>
                          <th className="py-2.5 font-semibold">키워드</th>
                          <th className="w-40 py-2.5 font-semibold">점수</th>
                          <th className="w-24 py-2.5 text-right font-semibold">급증 배수</th>
                          <th className="w-28 py-2.5 text-right font-semibold">영상수 (채널)</th>
                          <th className="w-32 py-2.5 font-semibold">국내 유입</th>
                          <th className="w-28 py-2.5 text-right font-semibold">조회/구독</th>
                          <th className="w-28 py-2.5 text-right font-semibold">조회수 (참고)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedCandidates.map((r, i) => {
                          // 매체 단독 후보는 유튜브 지표(점수·급증·조회수)가 없다.
                          // 없는 값을 0으로 채우면 "급증 ×0" 처럼 거짓으로 읽히므로 "—" 로 비운다.
                          const c = r.cand;
                          const row = inflow[r.term];
                          return (
                          <tr
                            key={r.term}
                            onClick={() => analyzeTerm(r.term.replace(/^#/, ""))}
                            className="cursor-pointer border-b border-[#f0eee9] transition-colors last:border-0 hover:bg-[#fcfbf6]"
                          >
                            <td className="py-2.5">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold ${
                                  i < 3 ? "bg-accent text-white" : "bg-[#f0eee9] text-muted-strong"
                                }`}
                              >
                                {i + 1}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <span className="font-semibold text-accent-ink">{r.term}</span>
                              {sourceBadges(r.source).map((b) => (
                                <span
                                  key={b}
                                  title={BADGE_META[b].desc}
                                  className={`ml-1.5 cursor-help rounded-full px-2 py-[2px] text-[10.5px] font-bold ${
                                    b === "media"
                                      ? "bg-[#eef2fb] text-[#3f5d8f]"
                                      : "bg-[#f0eee9] text-muted-strong"
                                  }`}
                                >
                                  {BADGE_META[b].label}
                                </span>
                              ))}
                              {c?.novel && (
                                <span
                                  title="과거 기준선의 어느 채널도 쓰지 않던 용어 — 신조어 가능성"
                                  className="ml-1.5 cursor-help rounded-full bg-accent-soft px-2 py-[2px] text-[10.5px] font-bold text-accent"
                                >
                                  신조어
                                </span>
                              )}
                              {c?.hashtag && (
                                <span
                                  title="해시태그로 등장 — 트렌드 명명이 이미 굳어졌다는 신호"
                                  className="ml-1.5 cursor-help rounded-full border border-[#dfebc6] px-2 py-[2px] text-[10.5px] font-bold text-[#7aa33f]"
                                >
                                  태그
                                </span>
                              )}
                              {c?.contextTag === "nonfood" && (
                                <span
                                  title={`이 용어가 나온 영상 제목이 게임·챌린지 등 비식품 맥락입니다 (식품어 포함 ${Math.round((c.foodShare ?? 0) * 100)}%). 제거하지 않고 순위만 내렸습니다.`}
                                  className="ml-1.5 cursor-help rounded-full bg-down-soft px-2 py-[2px] text-[10.5px] font-bold text-down"
                                >
                                  비식품?
                                </span>
                              )}
                              {c?.contextTag === "food" && (
                                <span
                                  title={`이 용어가 나온 영상 제목의 ${Math.round((c.foodShare ?? 0) * 100)}%가 식품 맥락입니다.`}
                                  className="ml-1.5 cursor-help rounded-full border border-[#dfebc6] px-2 py-[2px] text-[10.5px] font-bold text-[#7aa33f]"
                                >
                                  식품
                                </span>
                              )}
                              {(c?.examples?.[0] ?? row?.sample) && (
                                <p
                                  className="mt-1 max-w-[280px] truncate text-[11px] text-muted"
                                  title={c?.examples?.join("  ·  ") ?? row?.sample ?? ""}
                                >
                                  예: {c?.examples?.[0] ?? row?.sample}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5">
                              {c ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0eee9]">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.max(c.score, 3)}%`,
                                        background: i < 3 ? "linear-gradient(90deg,#82bc00,#4e8b10)" : "#c9dfa3",
                                      }}
                                    />
                                  </div>
                                  <span className="w-7 text-right text-xs font-bold tabular-nums">{c.score}</span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right text-[13px] font-bold tabular-nums text-accent">
                              {c ? `×${c.lift}` : <span className="font-normal text-muted">—</span>}
                            </td>
                            <td
                              title={
                                c
                                  ? `최근 이 말이 제목에 등장한 영상 ${c.videosRecent ?? c.dfRecent}건 · 퍼진 채널 ${c.dfRecent}개(과거 기준선 ${c.dfBaseline}개). 한 채널이 여러 영상을 올려도 채널은 1로 셉니다.`
                                  : `해외 식품 매체 ${row?.mediaCount ?? 0}곳에 등장했습니다. 유튜브에서는 아직 안 잡혔습니다.`
                              }
                              className="cursor-help py-2.5 text-right text-[13px] tabular-nums text-muted-strong"
                            >
                              {c ? (
                                <>
                                  <span className="font-semibold text-foreground">
                                    {formatCount(c.videosRecent ?? c.dfRecent)}
                                  </span>
                                  <span className="ml-1 text-[11px] text-muted">({c.dfRecent})</span>
                                </>
                              ) : (
                                <span className="text-[11px] text-muted">매체 {row?.mediaCount ?? 0}곳</span>
                              )}
                            </td>
                            <td className="py-2.5">{inflowCell(row, inflowLoading)}</td>
                            <td
                              title={c ? reactionTitle(c.reaction) : "유튜브 지표가 없는 매체 단독 후보입니다."}
                              className="cursor-help py-2.5 text-right text-[13px] tabular-nums text-muted-strong"
                            >
                              {c ? formatRatio(c.reaction) : "—"}
                            </td>
                            <td className="py-2.5 text-right text-[13px] tabular-nums text-muted-strong">
                              {c ? formatCount(c.views) : "—"}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <ul className="mt-5 space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                  <li>
                    <b className="font-semibold text-muted-strong">급증 배수(lift)</b> = 과거보다 몇 배 더 많은
                    채널이 이 말을 쓰는가. <code className="rounded bg-[#f0eee9] px-1">recipe</code> 처럼 원래도
                    흔한 말은 1 근처라 밀려납니다. <b className="font-semibold text-muted-strong">배수가 1보다
                    작으면 지고 있는 트렌드</b>입니다.
                  </li>
                  <li>
                    표에는 <b className="font-semibold text-muted-strong">영상수(채널)</b>를 나란히 보여줍니다. 다만{" "}
                    <b className="font-semibold text-muted-strong">급증 배수는 영상 수가 아니라 채널 수로 계산</b>합니다 —
                    한 채널이 영상 10개에 같은 제목을 복붙한 건 트렌드가 아니라 그 채널의 습관이라, 몇 개 채널로
                    번졌는지가 진짜 신호이기 때문입니다.
                  </li>
                  <li>
                    후보는 <b className="font-semibold text-muted-strong">제목 + 설명란 앞부분</b>에서 뽑습니다.
                    설명란 하단의 <code className="rounded bg-[#f0eee9] px-1">tags</code>·
                    <code className="rounded bg-[#f0eee9] px-1">keywords</code>·
                    <code className="rounded bg-[#f0eee9] px-1">disclaimer</code> 더미는 잘라내고, 흔한 일반어는
                    급증 배수(lift)가 알아서 밀어냅니다.
                  </li>
                  <li>
                    <b className="font-semibold text-muted-strong">조회수는 점수에 넣지 않습니다.</b> 조회수가 터진
                    영상은 대개 트렌드가 아니라 일반 클릭베이트였습니다. 참고용으로만 표시합니다.
                  </li>
                </ul>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const kw = keyword.trim();
              if (kw) void analyzeTerm(kw);
            }}
            className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-white p-4"
          >
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="키워드 (예: dubai chocolate)"
              className="h-10 flex-1 min-w-[220px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
            />
            <button
              type="submit"
              disabled={loading}
              style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
              className="h-10 rounded-[10px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
            >
              {loading ? "분석 중…" : "해외 신호 분석"}
            </button>
          </form>

          {error && <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{error}</div>}
          {data?.ytError && (
            <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-xs text-[#8a6a00]">
              YouTube 호출 실패 — Instagram 캡션만으로 분석했습니다. ({data.ytError.slice(0, 80)})
            </div>
          )}

          {!data ? (
            <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-16 text-center text-sm text-muted">
              키워드를 고른 뒤{" "}
              <b className="font-semibold text-muted-strong">해외 신호 분석</b>을 눌러보세요.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="YouTube 영상 수" value={formatCount(data.youtube.videoCount)} sub={`최근 ${data.windowDays}일 · ${data.region}`} />
                <Kpi label="평균 조회수" value={formatCount(data.youtube.avgViews)} sub={`샘플 ${data.youtube.sampled}건`} />
                <Kpi label="Shorts 비중" value={data.youtube.sampled ? `${Math.round((data.youtube.shortCount / data.youtube.sampled) * 100)}%` : "—"} sub={`${data.youtube.shortCount} / ${data.youtube.sampled}`} />
                <Kpi
                  label="분석 텍스트"
                  value={String(data.counts.total)}
                  sub={`YT ${data.counts.yt} + IG 캡션 ${data.counts.ig}${
                    data.counts.droppedByLang ? ` · 타언어 ${data.counts.droppedByLang}건 제외` : ""
                  }`}
                />
              </div>

              {data.youtube.topVideo && (
                <a
                  href={`https://www.youtube.com/watch?v=${data.youtube.topVideo.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl border border-line bg-white p-4 transition-colors hover:bg-[#fcfbf6]"
                >
                  <p className="text-xs text-muted">
                    최고 조회 영상 · {formatCount(data.youtube.topVideo.views)}회
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-accent-ink">
                    {data.youtube.topVideo.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{data.youtube.topVideo.channel}</p>
                </a>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-line bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-strong">
                      이유 태그 <span className="font-normal text-muted">(확산 이유 추정)</span>
                    </h2>
                    <span className="text-xs text-muted">{data.counts.total}건 기준</span>
                  </div>
                  {!r?.confident ? (
                    <p className="py-6 text-center text-sm text-muted">
                      이유 신호가 부족합니다. (최다 언급도 {r?.categories[0]?.docHits ?? 0}건 · 최소{" "}
                      {MIN_DOC_HITS}건 필요)
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
                        주요 확산 이유: <b className="text-sm font-bold">{r.dominant}</b>{" "}
                        <span className="font-semibold">
                          — {activeReasons[0].docHits}건 ({Math.round(activeReasons[0].share * 100)}%)
                        </span>
                        <span className="text-muted-strong"> · “{activeReasons[0].topWords.join(", ")}”</span>
                      </div>
                      <div className="space-y-2.5">
                        {activeReasons.map((c, i) => {
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
                              <span className="w-16 shrink-0 text-right text-[13px] font-bold tabular-nums">
                                {c.docHits}건 · {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        {activeReasons.map((c) => c.topWords.slice(0, 3).join(", ")).join(" / ")}
                      </p>
                    </>
                  )}
                </section>

                <section className="rounded-2xl border border-line bg-white p-5">
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-strong">
                      동반 키워드 <span className="font-normal text-muted">(실제 공출현)</span>
                    </h2>
                    <span className="text-xs text-muted">2건 이상 등장</span>
                  </div>
                  <p className="mb-3 text-xs text-muted">
                    검색 연관어가 아니라, <b className="font-semibold text-muted-strong">실제 콘텐츠 텍스트</b>
                    에서 함께 등장한 용어입니다. (검색 동반 상승 노이즈 없음)
                  </p>
                  {data.coTerms.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">공출현 용어를 찾지 못했습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.coTerms.map((t) => (
                        <span
                          key={t.term}
                          title={`${t.docs}건 (${Math.round(t.rate * 100)}%)에서 함께 등장`}
                          className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-[#dfebc6] bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-ink"
                        >
                          {t.term}
                          <span className="text-[11px] font-bold text-[#7aa33f]">{t.docs}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-2 text-sm font-semibold text-muted-strong">
                  Reddit 신호 <span className="font-normal text-muted">(해외 담론)</span>
                </h2>
                {reddit ? (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Kpi label="게시물" value={String(reddit.stat.postCount)} sub={reddit.stat.subreddits.join(", ")} />
                    <Kpi label="최근 30일" value={String(reddit.stat.recentCount)} sub={`이전 30일 ${reddit.stat.priorCount}건`} />
                    <Kpi label="증감률" value={reddit.stat.riseRate === null ? "—" : `${reddit.stat.riseRate > 0 ? "+" : ""}${reddit.stat.riseRate.toFixed(1)}%`} sub="최근 vs 이전 30일" />
                    <Kpi label="평균 업보트" value={formatCount(reddit.stat.avgScore)} sub={`댓글 ${formatCount(reddit.stat.totalComments)}`} />
                  </div>
                ) : (
                  <p className="rounded-xl bg-[#f0eee9] px-4 py-3 text-xs text-muted-strong">
                    {redditNote ?? "Reddit 미설정"} — `.env.local`에 `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`를
                    넣으면 이 패널이 자동으로 채워집니다. (코드 수정 불필요)
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-[12.5px] font-semibold text-muted-strong">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold leading-none tracking-tight">{value}</p>
      <p className="mt-2 truncate text-xs text-muted">{sub}</p>
    </div>
  );
}
