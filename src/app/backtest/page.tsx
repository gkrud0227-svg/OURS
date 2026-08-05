"use client";

import { useEffect, useState } from "react";
import {
  fetchBacktest,
  fetchContentBacktest,
  fetchCoverage,
  type BacktestResponse,
  type ContentBacktestResponse,
  type CoverageResponse,
} from "@/lib/backtest-client";
import { COVERAGE_META, DASHBOARD_TOP, type CoverageHit } from "@/lib/coverage";
import {
  VERDICT_META,
  ACTIONABLE_LEAD_WEEKS,
  type BacktestResult,
} from "@/lib/backtest";
import {
  CONTENT_VERDICT_META,
  type ContentBacktestResult,
} from "@/lib/content-backtest";
import type { WeekPoint } from "@/lib/types";

/** 검증된 과거 히트 — 데이터랩에 뚜렷한 부상~피크 곡선이 있는 사례. */
const DEFAULT_HITS = [
  "탕후루",
  "두바이쫀득쿠키",
  "버터떡",
  "봄동비빔밥",
  "우베",
  "양쯔깐루",
  "왁뿌소금빵",
];

const TONE: Record<"good" | "mid" | "bad", { chip: string; text: string }> = {
  good: { chip: "bg-accent-soft text-accent", text: "text-accent" },
  mid: { chip: "bg-[#fbf3de] text-[#8a6a00]", text: "text-[#8a6a00]" },
  bad: { chip: "bg-down-soft text-down", text: "text-down" },
};

export default function BacktestPage() {
  const [text, setText] = useState(DEFAULT_HITS.join(", "));
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<ContentBacktestResponse | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [coverageSeeds, setCoverageSeeds] = useState("디저트, 베이커리, 음료, 스낵");
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  // 최근 검증 결과를 유지한다 — 탭 이동·새로고침에도 마지막 테스트가 그대로 보이도록.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("td.backtest.v1");
      if (raw) {
        const s = JSON.parse(raw) as Partial<{
          text: string;
          coverageSeeds: string;
          data: BacktestResponse;
          content: ContentBacktestResponse;
          coverage: CoverageResponse;
        }>;
        if (s.text) setText(s.text);
        if (s.coverageSeeds) setCoverageSeeds(s.coverageSeeds);
        if (s.data) setData(s.data);
        if (s.content) setContent(s.content);
        if (s.coverage) setCoverage(s.coverage);
      }
    } catch {
      /* 손상된 저장값 무시 */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        "td.backtest.v1",
        JSON.stringify({ text, coverageSeeds, data, content, coverage }),
      );
    } catch {
      /* 용량 초과 무시 */
    }
  }, [hydrated, text, coverageSeeds, data, content, coverage]);

  async function runCoverage(e: React.FormEvent) {
    e.preventDefault();
    const hits = text.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const seeds = coverageSeeds.split(",").map((s) => s.trim()).filter(Boolean);
    if (!hits.length || !seeds.length) return;
    setCoverageLoading(true);
    setCoverageError(null);
    try {
      setCoverage(await fetchCoverage(seeds, hits));
    } catch (err) {
      setCoverage(null);
      setCoverageError(err instanceof Error ? err.message : "커버리지 조회에 실패했습니다.");
    } finally {
      setCoverageLoading(false);
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const keywords = text.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!keywords.length) return;
    setLoading(true);
    setError(null);
    setContent(null);
    setContentError(null);
    let searchResults: BacktestResult[] = [];
    try {
      const res = await fetchBacktest(keywords);
      setData(res);
      searchResults = res.results;
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "백테스트에 실패했습니다.");
      setLoading(false);
      return;
    }
    setLoading(false);

    // 검색 백테스트 결과의 신호·피크 시점으로 콘텐츠 교차검증을 이어서 실행.
    const items = searchResults.map((r) => ({
      keyword: r.keyword,
      signalPeriod: r.signalPeriod,
      peakPeriod: r.peakPeriod,
    }));
    if (!items.length) return;
    setContentLoading(true);
    try {
      setContent(await fetchContentBacktest(items));
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "콘텐츠 교차검증에 실패했습니다.");
    } finally {
      setContentLoading(false);
    }
  }

  const s = data?.summary;

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">예측 검증 (백테스트)</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            히트 적중률
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          과거에 실제로 떴던 히트 키워드의 데이터랩 전체 곡선에{" "}
          <b className="font-medium">지금 쓰는 급상승 로직(전주 대비 +30%, 4주 MA)을 그대로</b> 되감아
          적용합니다. &ldquo;우리 모델이 <b className="font-medium">실제 피크 전에</b> 이 트렌드를
          잡아냈을까&rdquo;를 사후 검증해 적중률을 산출합니다.
        </p>
      </header>

      <form onSubmit={run} className="rounded-2xl border border-line bg-white p-4">
        <label className="mb-2 block text-[12.5px] font-semibold text-muted-strong">
          검증할 과거 히트 키워드 <span className="font-normal text-muted">(쉼표 구분 · 최대 10개)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="두바이초콜릿, 탕후루, 요아정 …"
            className="h-10 flex-1 min-w-[280px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
          />
          <button
            type="submit"
            disabled={loading}
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="h-10 rounded-[10px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          >
            {loading ? "검증 중…" : "백테스트 실행"}
          </button>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted">
          각 키워드의 <b className="font-semibold">과거 30개월 주간</b> 검색 곡선을 데이터랩에서 받아,
          매주 &ldquo;그 주까지의 데이터만&rdquo;으로 급상승을 판정합니다(미래 미참조). 상승률은 비율이라
          데이터랩 상대지수 정규화에 영향받지 않습니다.
        </p>
      </form>

      {error && <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{error}</div>}

      {!data ? (
        <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-16 text-center text-sm text-muted">
          과거 히트 키워드를 넣고 <b className="font-semibold text-muted-strong">백테스트 실행</b>을 눌러보세요.
        </div>
      ) : (
        <>
          {s && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="피크 전 적중률"
                value={`${s.hitRate}%`}
                sub={`${s.hit} / ${s.total}건 · 피크 전에 감지`}
                emphasis
              />
              <Kpi
                label="실행 적중률"
                value={`${s.actionableRate}%`}
                sub={`${s.actionable}건 · ${ACTIONABLE_LEAD_WEEKS}주+ 리드`}
              />
              <Kpi
                label="중앙 리드타임"
                value={s.medianLeadWeeks !== null ? `${s.medianLeadWeeks}주` : "—"}
                sub="감지 성공 건 기준"
              />
              <Kpi
                label="검증 구간"
                value={`${data.results.length}건`}
                sub={`${data.startDate} ~ ${data.endDate}`}
              />
            </div>
          )}

          {data.missingData.length > 0 && (
            <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-xs text-[#8a6a00]">
              데이터랩에 곡선이 없어 제외: <b className="font-semibold">{data.missingData.join(", ")}</b>{" "}
              — 철자를 실제 검색어 형태로 바꿔보세요.
            </div>
          )}

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-muted-strong">백테스트 결과표</h2>
            <p className="mb-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Dot className="bg-accent" /> 급상승 감지 시점(예측)
              </span>
              <span className="mx-3 inline-flex items-center gap-1">
                <Dot className="bg-down" /> 실제 피크
              </span>
              곡선 위 두 점의 간격이 <b className="font-semibold text-muted-strong">리드타임</b>입니다.
            </p>

            <div className="nt-scroll overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-semibold">키워드</th>
                    <th className="w-[190px] py-2.5 font-semibold">검색 곡선 (신호 → 피크)</th>
                    <th className="py-2.5 font-semibold">급상승 감지<br />(예측 시점)</th>
                    <th className="py-2.5 font-semibold">실제 피크</th>
                    <th className="py-2.5 text-right font-semibold">리드타임</th>
                    <th className="py-2.5 text-right font-semibold">포착 시점<br />(피크 대비)</th>
                    <th className="py-2.5 text-center font-semibold">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <Row key={r.keyword} r={r} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["actionable", "hit", "late", "missed"] as const).map((v) => (
                <div key={v} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 rounded-full px-2 py-[2px] font-bold ${TONE[VERDICT_META[v].tone].chip}`}>
                    {VERDICT_META[v].label}
                  </span>
                  <span className="text-muted">{VERDICT_META[v].desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 콘텐츠 교차검증 */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-strong">
                콘텐츠 교차검증 <span className="font-normal text-muted">(SNS가 검색을 앞서는가)</span>
              </h2>
              {contentLoading && <span className="text-xs text-muted">YouTube 수집 중…</span>}
            </div>
            <p className="mb-4 text-xs leading-relaxed text-muted">
              각 키워드의 <b className="font-semibold text-muted-strong">검색 피크 이전 12개월</b> YouTube 영상을
              받아 <b className="font-semibold text-muted-strong">게시월 분포</b>를 만듭니다. 콘텐츠가 몰리기
              시작한 달(<span className="font-semibold text-accent">■ 개시</span>)과 검색 급상승 신호 달을 비교해
              둘 중 무엇이 먼저 움직였는지 봅니다.
            </p>

            {contentError && (
              <div className="mb-3 rounded-xl bg-[#fbf3de] px-4 py-3 text-xs text-[#8a6a00]">{contentError}</div>
            )}

            {content ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <Kpi
                    label="콘텐츠 선행"
                    value={`${content.summary.contentLeads} / ${content.summary.measured}`}
                    sub="검색 신호보다 콘텐츠가 먼저 급증한 건수"
                    emphasis
                  />
                  <Kpi
                    label="피크 대비 중앙 선행"
                    value={content.summary.medianLeadVsPeak !== null ? `${content.summary.medianLeadVsPeak}개월` : "—"}
                    sub="콘텐츠 개시가 검색 피크보다 앞선 개월(중앙값)"
                  />
                  <Kpi
                    label="측정 성공"
                    value={`${content.summary.measured} / ${content.summary.total}`}
                    sub="게시월 개시 시점을 특정한 건수"
                  />
                </div>

                <div className="nt-scroll overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-muted">
                        <th className="py-2.5 font-semibold">키워드</th>
                        <th className="w-[220px] py-2.5 font-semibold">게시월 분포 (개시 → 피크)</th>
                        <th className="py-2.5 font-semibold">콘텐츠 개시</th>
                        <th className="py-2.5 font-semibold">검색 신호</th>
                        <th className="py-2.5 text-right font-semibold">콘텐츠 → 검색신호</th>
                        <th className="py-2.5 text-center font-semibold">해석</th>
                      </tr>
                    </thead>
                    <tbody>
                      {content.results.map((r) => (
                        <ContentRow key={r.keyword} r={r} />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(["content-leads", "coincident", "search-leads", "insufficient"] as const).map((v) => (
                    <div key={v} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 rounded-full px-2 py-[2px] font-bold ${TONE[CONTENT_VERDICT_META[v].tone].chip}`}>
                        {CONTENT_VERDICT_META[v].label}
                      </span>
                      <span className="text-muted">{CONTENT_VERDICT_META[v].desc}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              !contentLoading && (
                <p className="py-4 text-center text-sm text-muted">검색 백테스트 후 자동으로 이어서 실행됩니다.</p>
              )
            )}
          </section>

          {/* 발굴 커버리지 */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-strong">
                발굴 커버리지 <span className="font-normal text-muted">(시드가 이 히트들을 찾아내는가)</span>
              </h2>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              위 백테스트는 &ldquo;추적했다면 급상승을 <b className="font-semibold text-muted-strong">감지</b>했을까&rdquo;를
              봅니다. 여기선 그 앞단 — 이 시드로 <b className="font-semibold text-muted-strong">발굴</b>했을 때 히트
              키워드가 후보에 <b className="font-semibold text-muted-strong">잡히기라도</b> 하는지 봅니다.
              (감지 가능 ≠ 발굴 가능)
            </p>

            <form onSubmit={runCoverage} className="mb-4 flex flex-wrap items-center gap-2.5">
              <input
                value={coverageSeeds}
                onChange={(e) => setCoverageSeeds(e.target.value)}
                placeholder="시드 (예: 디저트, 베이커리, 음료, 스낵)"
                className="h-10 flex-1 min-w-[260px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
              />
              <button
                type="submit"
                disabled={coverageLoading}
                className="h-10 rounded-[10px] border border-accent-bright px-5 text-sm font-bold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
              >
                {coverageLoading ? "확인 중…" : "발굴 커버리지 확인"}
              </button>
            </form>

            {coverageError && (
              <div className="mb-3 rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{coverageError}</div>
            )}

            {coverage && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <Kpi
                    label="발굴 커버리지"
                    value={`${coverage.summary.coverageRate}%`}
                    sub={`대시보드 노출 ${coverage.summary.onDashboard} / ${coverage.summary.total}건`}
                    emphasis
                  />
                  <Kpi
                    label="후보에라도 등장"
                    value={`${coverage.summary.surfaced} / ${coverage.summary.total}`}
                    sub={`검색량 상위 ${DASHBOARD_TOP}위 밖 포함`}
                  />
                  <Kpi
                    label="연관 후보 풀"
                    value={`${coverage.poolSize.toLocaleString()}개`}
                    sub={`시드: ${coverage.seeds.join("·")}`}
                  />
                </div>

                <div className="nt-scroll overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-muted">
                        <th className="py-2.5 font-semibold">히트 키워드</th>
                        <th className="py-2.5 text-right font-semibold">검색량 순위</th>
                        <th className="py-2.5 text-right font-semibold">월 검색량</th>
                        <th className="py-2.5 text-center font-semibold">발굴 결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverage.results.map((h) => (
                        <CoverageRow key={h.keyword} h={h} />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(["onDashboard", "surfacedButCut", "belowVolume", "notSurfaced"] as const).map((v) => (
                    <div key={v} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 rounded-full px-2 py-[2px] font-bold ${TONE[COVERAGE_META[v].tone].chip}`}>
                        {COVERAGE_META[v].label}
                      </span>
                      <span className="text-muted">{COVERAGE_META[v].desc}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 rounded-xl bg-[#f0eee9] px-4 py-3 text-xs leading-relaxed text-muted-strong">
                  <b className="font-semibold">읽는 법</b> — 미발굴이 많다면 급상승 로직이 아니라{" "}
                  <b className="font-semibold">시드가 약한</b> 것입니다. keywordstool은 시드와 어휘가 겹치는
                  연관어만 반환하므로, <b className="font-semibold">신조어 제품명</b>(두바이초콜릿 등)은 카테고리
                  시드로 잘 안 잡힙니다. 이런 키워드는 <b className="font-semibold">관심 키워드에 직접 추가</b>해
                  추적하거나, <b className="font-semibold">해외 트렌드</b> 탭의 콘텐츠 기반 발굴로 보완하세요.
                </p>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 text-xs leading-relaxed text-muted">
            <h3 className="mb-2 text-sm font-semibold text-muted-strong">방법론 · 한계</h3>
            <ul className="space-y-1.5">
              <li>
                <b className="font-semibold text-muted-strong">미래 미참조</b> — 신호는 매주 그 주까지의
                데이터만으로 판정합니다. 상승률은 비율이라 데이터랩의 &ldquo;피크=100&rdquo; 정규화에
                불변이고, 절대 수준 하한은 실시간보다 보수적이라 <b className="font-semibold text-muted-strong">
                조기 감지력을 과소평가</b>할지언정 과대평가하지 않습니다.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">콘텐츠 교차검증</b>은 피크 이전 12개월 창으로
                수집합니다. 상한만 두면 누적 조회수가 쌓인 옛날 영상이 잡혀 &ldquo;콘텐츠 선행&rdquo;이 과대
                집계되므로, 하한(<code className="rounded bg-[#f0eee9] px-1">publishedAfter</code>)으로 트렌드 시기만
                남깁니다. order=viewCount 표본이라 조회수 낮은 초기 영상은 놓칠 수 있어 &ldquo;콘텐츠 선행&rdquo;
                결론에는 <b className="font-semibold text-muted-strong">보수적</b>입니다.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">생존 편향 주의</b> — 여기 넣는 건 &ldquo;실제로
                뜬&rdquo; 키워드뿐입니다. 적중률이 높아도 &ldquo;뜨지 않은 키워드에 헛신호를 냈는가&rdquo;(오탐률)는
                별도로 봐야 합니다.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ r }: { r: BacktestResult }) {
  const meta = VERDICT_META[r.verdict];
  const tone = TONE[meta.tone];
  return (
    <tr className="border-b border-[#f0eee9] last:border-0">
      <td className="py-3 pr-2 font-semibold text-accent-ink">{r.keyword}</td>
      <td className="py-3">
        <Spark weeks={r.weeks} signalIndex={r.signalIndex} peakIndex={r.peakIndex} />
      </td>
      <td className="py-3 text-[13px] text-muted-strong">
        {r.signalPeriod ? (
          <>
            {r.signalPeriod.slice(0, 7)}
            <span className="ml-1 text-xs text-muted">
              (+{r.signalRiseRate !== null ? Math.round(r.signalRiseRate) : "—"}%)
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 text-[13px] text-muted-strong">{r.peakPeriod.slice(0, 7)}</td>
      <td className={`py-3 text-right text-[13px] font-bold tabular-nums ${r.leadWeeks !== null && r.leadWeeks >= 1 ? tone.text : "text-muted"}`}>
        {r.leadWeeks === null ? "—" : r.leadWeeks > 0 ? `${r.leadWeeks}주 전` : r.leadWeeks === 0 ? "동시" : `${-r.leadWeeks}주 늦음`}
      </td>
      <td className="py-3 text-right text-[13px] tabular-nums text-muted-strong">
        {r.caughtAtPctOfPeak !== null ? `${r.caughtAtPctOfPeak}%` : "—"}
      </td>
      <td className="py-3 text-center">
        <span title={meta.desc} className={`cursor-help rounded-full px-2.5 py-1 text-xs font-bold ${tone.chip}`}>
          {meta.label}
        </span>
      </td>
    </tr>
  );
}

function CoverageRow({ h }: { h: CoverageHit }) {
  const meta = COVERAGE_META[h.status];
  const tone = TONE[meta.tone];
  return (
    <tr className="border-b border-[#f0eee9] last:border-0">
      <td className="py-3 pr-2 font-semibold text-accent-ink">{h.keyword}</td>
      <td className={`py-3 text-right text-[13px] font-bold tabular-nums ${h.rank && h.rank <= DASHBOARD_TOP ? tone.text : "text-muted"}`}>
        {h.rank !== null ? `${h.rank}위` : "—"}
      </td>
      <td className="py-3 text-right text-[13px] tabular-nums text-muted-strong">
        {h.volumeTotal !== null ? h.volumeTotal.toLocaleString() : "—"}
      </td>
      <td className="py-3 text-center">
        <span title={meta.desc} className={`cursor-help rounded-full px-2.5 py-1 text-xs font-bold ${tone.chip}`}>
          {meta.label}
        </span>
      </td>
    </tr>
  );
}

function ContentRow({ r }: { r: ContentBacktestResult }) {
  const meta = CONTENT_VERDICT_META[r.verdict];
  const tone = TONE[meta.tone];
  const lead = r.leadVsSignalMonths;
  return (
    <tr className="border-b border-[#f0eee9] last:border-0">
      <td className="py-3 pr-2 font-semibold text-accent-ink">{r.keyword}</td>
      <td className="py-3">
        <MonthBars r={r} />
      </td>
      <td className="py-3 text-[13px] text-muted-strong">
        {r.onsetMonth ?? <span className="text-muted">—</span>}
      </td>
      <td className="py-3 text-[13px] text-muted-strong">
        {r.signalMonth ?? <span className="text-muted">—</span>}
      </td>
      <td className={`py-3 text-right text-[13px] font-bold tabular-nums ${lead !== null && lead >= 1 ? tone.text : "text-muted"}`}>
        {lead === null
          ? "—"
          : lead > 0
            ? `${lead}개월 선행`
            : lead === 0
              ? "동시"
              : `${-lead}개월 늦음`}
      </td>
      <td className="py-3 text-center">
        <span title={meta.desc} className={`cursor-help rounded-full px-2.5 py-1 text-xs font-bold ${tone.chip}`}>
          {meta.label}
        </span>
      </td>
    </tr>
  );
}

/** 게시월 막대. 개시(초록)·검색신호(점선)·피크(빨강) 표시. */
function MonthBars({ r }: { r: ContentBacktestResult }) {
  const h = r.histogram;
  if (!h.length) return <span className="text-xs text-muted">표본 없음</span>;
  const W = 210;
  const H = 40;
  const n = h.length;
  const max = Math.max(...h.map((b) => b.count), 1);
  const bw = (W - 2) / n;
  return (
    <svg width={W} height={H} className="overflow-visible">
      {h.map((b, i) => {
        const bh = (b.count / max) * (H - 6);
        const isOnset = b.month === r.onsetMonth;
        const isPeak = b.month === r.peakMonth;
        const isSignal = b.month === r.signalMonth;
        const fill = isPeak ? "#b0512f" : isOnset ? "#4e8b10" : "#c9dfa3";
        return (
          <g key={b.month}>
            {isSignal && (
              <line
                x1={i * bw + bw / 2}
                y1="0"
                x2={i * bw + bw / 2}
                y2={H - 4}
                stroke="#4e8b10"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.55"
              />
            )}
            <rect
              x={i * bw + 1}
              y={H - 4 - bh}
              width={Math.max(bw - 1.5, 1)}
              height={bh}
              rx="1"
              fill={fill}
            >
              <title>{`${b.month} · ${b.count}편`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function Spark({
  weeks,
  signalIndex,
  peakIndex,
}: {
  weeks: WeekPoint[];
  signalIndex: number | null;
  peakIndex: number;
}) {
  const W = 180;
  const H = 40;
  const n = weeks.length;
  if (n < 2) return <span className="text-xs text-muted">—</span>;
  const max = Math.max(...weeks.map((w) => w.ratio), 1);
  const x = (i: number) => (i / (n - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  const path = weeks.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w.ratio).toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke="#c9dfa3" strokeWidth="1.5" />
      {/* 피크 */}
      <circle cx={x(peakIndex)} cy={y(weeks[peakIndex].ratio)} r="3.2" fill="#b0512f" />
      {/* 급상승 감지 */}
      {signalIndex !== null && (
        <>
          <line
            x1={x(signalIndex)}
            y1="2"
            x2={x(signalIndex)}
            y2={H - 2}
            stroke="#4e8b10"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
          <circle cx={x(signalIndex)} cy={y(weeks[signalIndex].ratio)} r="3.2" fill="#4e8b10" />
        </>
      )}
    </svg>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}

function Kpi({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis ? "border-accent-bright/40 bg-accent-soft/40" : "border-line bg-white"}`}>
      <p className="text-[12.5px] font-semibold text-muted-strong">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold leading-none tracking-tight ${emphasis ? "text-accent" : ""}`}>{value}</p>
      <p className="mt-2 truncate text-xs text-muted">{sub}</p>
    </div>
  );
}
