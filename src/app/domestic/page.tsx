"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { guessFoodType } from "@/lib/odm";
import { useStore } from "@/lib/store-context";
import { shopGrade, SHOP_META, type ShoppingTrend } from "@/lib/shopping";
import { trendFromWeeks, gateByLevel, STATUS_META, type TrendStatus } from "@/lib/trend";
import type { WeekPoint } from "@/lib/types";
import { estimateUnits, quotaLine, addQuota } from "@/lib/quota";
import { QuotaBadge } from "@/components/QuotaBadge";

/** 이 후보를 떠올린 발굴 소스. */
type Source = "youtube" | "search" | "both";

interface Row {
  term: string;
  /** 발굴 출처 — 유튜브 콘텐츠 / 네이버 검색 자동완성 / 둘 다 */
  source: Source;
  /** 유튜브 콘텐츠 확산 배수 (자동완성 단독 후보엔 없음) */
  lift?: number;
  dfRecent?: number;
  /** 자동완성 완성어 순위 (검색 소스 후보) */
  acRank?: number;
  novel: boolean;
  hasSearch: boolean;
  searchStatus: TrendStatus;
  searchRise: number | null;
  weeks: WeekPoint[];
  /** 구매 의향(쇼핑 클릭) — 보조 축이라 없을 수 있다. */
  shop?: ShoppingTrend;
  /** 식품 맥락 판정 — "nonfood"면 랭킹 맨 아래로 강등 */
  contextTag?: "food" | "neutral" | "nonfood";
}


type Verdict = "triple" | "double" | "contentLead" | "searchOnly" | "contentOnly";

function verdictOf(r: Row): Verdict {
  const rising = r.searchStatus === "surge" || r.searchStatus === "up";
  // 검색까지 오른 뒤 쇼핑 클릭도 오르면 구매 의향까지 확인된 것으로 본다.
  if (rising && shopGrade(r.shop) === "rising") return "triple";
  if (r.novel && rising) return "double";
  if (rising) return "searchOnly";
  if (r.novel && !r.hasSearch) return "contentLead";
  return "contentOnly";
}

/**
 * 등급 체계는 **검색 신호 중심**이다.
 *
 * 실측 근거 — 과거 히트 5건의 콘텐츠 개시월 vs 검색 신호월을 재보니 콘텐츠가
 * 앞선 건 1건뿐이었다(탕후루 4개월). 2건은 동시, 1건은 오히려 검색이 2개월
 * 앞섰다. 반면 검색 급상승 로직은 5건 중 4건을 피크 전에, 중앙값 8주 앞서
 * 잡았다. 예측력 백테스트에서도 콘텐츠 단독 후보의 정밀도는 41건 중 3건(7%)
 * 이었고 대부분 이미 피크였다.
 *
 * 그래서 콘텐츠는 **후보 공급기**로만 쓰고, 판정은 검색에 맡긴다.
 * "콘텐츠에만 있고 검색이 안 따라오는 것"을 조기 신호로 표시하지 않는다.
 */
const VERDICT_META: Record<Verdict, { label: string; tone: "good" | "mid" | "muted" }> = {
  triple: { label: "삼중 확인", tone: "good" },
  double: { label: "이중 확인", tone: "good" },
  searchOnly: { label: "검색 상승", tone: "good" },
  contentLead: { label: "검색 미상승", tone: "muted" },
  contentOnly: { label: "검색 미상승", tone: "muted" },
};

/** 발굴 출처 배지 — 유튜브(콘텐츠발)·검색(자동완성발)·둘 다. */
const SOURCE_META: Record<Source, { label: string; cls: string }> = {
  youtube: { label: "유튜브", cls: "bg-[#f7ece6] text-down" },
  search: { label: "검색", cls: "bg-[#eef3fb] text-[#365a8f]" },
  both: { label: "유튜브+검색", cls: "bg-accent-soft text-accent-ink" },
};

const TONE: Record<"good" | "mid" | "muted" | "bad", string> = {
  good: "bg-accent-soft text-accent",
  mid: "bg-[#fbf3de] text-[#8a6a00]",
  muted: "bg-[#f0eee9] text-muted",
  bad: "bg-down-soft text-down",
};

const STATUS_TONE: Record<TrendStatus, string> = {
  surge: "text-accent font-bold",
  up: "text-accent",
  flat: "text-muted-strong",
  down: "text-down",
  none: "text-muted",
};

/**
 * 발굴한 키워드에서 바로 ODM 스크리닝으로 넘어가는 링크.
 *
 * 품목제조보고는 공식 분류명으로만 검색되므로 키워드에서 품목유형을 추정해 넘긴다.
 * 추정이 안 되면(예: "탕후루") 유형 없이 보내 ODM 화면에서 직접 고르게 한다.
 */
function OdmLink({ term }: { term: string }) {
  const type = guessFoodType(term);
  const href = type
    ? `/odm?type=${encodeURIComponent(type)}&term=${encodeURIComponent(term)}`
    : `/odm?term=${encodeURIComponent(term)}`;
  return (
    <Link
      href={href}
      title={
        type
          ? `"${term}" → ${type} 제조 이력이 있는 업체를 찾습니다`
          : `"${term}" 는 품목유형을 자동 판단하지 못했습니다. ODM 화면에서 유형을 골라주세요.`
      }
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-[9px] border border-line px-2.5 py-1.5 text-xs font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:bg-accent-soft hover:text-accent"
    >
      ODM 스크리닝
      {type && <span className="font-normal text-muted">· {type}</span>}
    </Link>
  );
}

export default function DomesticPage() {
  // 발굴은 store 한 곳(candidates)에 담긴다 → 대시보드와 국내 발굴이 같은 데이터를 공유하고,
  // localStorage 에 영속되므로 탭 이동·새로고침에도 유지된다.
  // 단, 이 탭은 **국내(KR)만** 발굴한다(scope="domestic"). 해외는 해외 트렌드 탭, 홈은 국내+해외.
  const { candidates, discovering, lastDiscoveryAt, runDiscovery, seeds } = useStore();
  const [seedText, setSeedText] = useState(seeds.join(", "));
  const [error, setError] = useState<string | null>(null);

  // store.candidates(대시보드와 동일 데이터)를 국내 트렌드 표 모양(Row)으로 변환.
  // 홈과 동일하게 **상승률(riseRate) 내림차순**으로 정렬한다. 상승률이 없는(검색 미상승)
  // 후보는 맨 아래로, **비식품 판정 후보는 그보다 더 아래로** 보낸다.
  const rows = useMemo<Row[]>(() => {
    const nf = (r: Row) => (r.contextTag === "nonfood" ? 1 : 0);
    return candidates
      .map((c) => {
        const t = trendFromWeeks(c.weeks);
        return {
          term: c.name,
          source: (c.source ?? "search") as Source,
          lift: c.lift,
          dfRecent: c.dfRecent,
          novel: c.novel ?? false,
          hasSearch: c.weeks.length > 0,
          searchStatus: c.weeks.length ? gateByLevel(t.status, c.weeks) : "none",
          searchRise: t.riseRate,
          weeks: c.weeks,
          shop: c.shop,
          contextTag: c.contextTag,
        };
      })
      .sort(
        (a, b) => nf(a) - nf(b) || (b.searchRise ?? -Infinity) - (a.searchRise ?? -Infinity),
      );
  }, [candidates]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const list = seedText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (!list.length) return;
    // 국내 트렌드 탭은 **국내(KR)만** 발굴한다. (해외는 해외 트렌드 탭에서, 홈은 국내+해외)
    const estimate = estimateUnits(list.length, 0);
    const okToRun = window.confirm(
      `키워드 발굴은 유튜브 API 쿼터를 씁니다.\n` +
        `국내 시드 ${list.length}개를 각각 조회합니다. (해외는 해외 트렌드 탭에서)\n` +
        `${quotaLine(estimate)}\n진행할까요?`,
    );
    if (!okToRun) return;
    addQuota(estimate);
    setError(null);
    const r = await runDiscovery(list, "domestic");
    if (r.error) setError(r.error);
  }

  const doubleCount = rows.filter((r) => ["triple", "double"].includes(verdictOf(r))).length;
  const ytCount = rows.filter((r) => r.source === "youtube" || r.source === "both").length;
  const acCount = rows.filter((r) => r.source === "search" || r.source === "both").length;

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">국내 트렌드</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            콘텐츠 → 검색 검증
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          검색광고(keywordstool)는 시드와 <b className="font-medium">어휘가 겹치는</b> 연관어만 줘서 신조어
          제품명을 놓칩니다. 그래서 <b className="font-medium">유튜브 콘텐츠 제목에서 신조어를 발굴</b>하고,
          그 발굴어를 <b className="font-medium">네이버 검색 자동완성으로 확장</b>(제품 변형·연관 신조합)한 뒤,
          각 후보를 <b className="font-medium">데이터랩 검색 급상승으로 검증</b>합니다.
          자동완성 시드는 <b className="font-medium">유튜브가 발굴한 키워드</b>라, 유튜브가 못 잡으면 돌지 않습니다.
        </p>
      </header>

      <form onSubmit={run} className="rounded-2xl border border-line bg-white p-4">
        <label className="mb-2 block text-[12.5px] font-semibold text-muted-strong">
          시드 <span className="font-normal text-muted">(유튜브 검색용 · 의도어 포함 · 최대 8개)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="신상 디저트, 유행 간식, 편의점 신상"
            className="h-10 flex-1 min-w-[280px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
          />
          <button
            type="submit"
            disabled={discovering}
            title="유튜브 API 쿼터를 사용합니다 (시드 1개당 약 500 units)"
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
          시드엔 <b className="font-semibold">의도어</b>(신상·유행·신제품)를 붙이세요. 그래야 최신 업로드가
          트렌드를 좇습니다. 콘텐츠 발굴은 keywordstool이 아니라 <b className="font-semibold">실제 영상 제목</b>에서
          신조어를 뽑습니다.
        </p>
      </form>

      {error && <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{error}</div>}
      {discovering && (
        <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          유튜브 콘텐츠 발굴 → 자동완성 확장 → 데이터랩 검증 중…
        </div>
      )}

      {rows.length === 0 ? (
        !discovering && (
          <div className="rounded-2xl border border-dashed border-[#d8d3c9] bg-white px-4 py-16 text-center text-sm text-muted">
            시드를 넣고 <b className="font-semibold text-muted-strong">키워드 발굴</b>을 눌러보세요. 대시보드에서 발굴한 결과도 여기 함께 뜹니다.
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="이중 확인 후보" value={String(doubleCount)} sub="콘텐츠 신조어 + 검색 상승" emphasis />
            <Kpi label="발굴 후보" value={String(rows.length)} sub="유튜브 + 검색 자동완성 합산" />
            <Kpi label="유튜브 발굴" value={String(ytCount)} sub="콘텐츠 신조어" />
            <Kpi label="검색 자동완성" value={String(acCount)} sub="발굴어 확장" />
          </div>

          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-strong">
                발굴 후보 <span className="font-normal text-muted">(콘텐츠 신호 + 검색 검증)</span>
              </h2>
              {lastDiscoveryAt && (
                <span className="text-xs text-muted">
                  {new Date(lastDiscoveryAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  발굴 · 탭 이동·새로고침에도 유지됩니다
                </span>
              )}
            </div>
            <p className="mb-4 text-xs leading-relaxed text-muted">
              <b className="font-semibold text-muted-strong">콘텐츠 신호</b>(유튜브 채널 확산 lift)는{" "}
              <b className="font-semibold text-muted-strong">후보를 넓게 뽑는 용도</b>이고, 판정은{" "}
              <b className="font-semibold text-muted-strong">검색 검증</b>(네이버 데이터랩 급상승)이 합니다.
              과거 히트 5건을 재보니 콘텐츠가 검색보다 앞선 경우는 1건뿐이었고, 검색 급상승 로직은 4건을 피크
              전에 중앙값 8주 앞서 잡았습니다. 그래서{" "}
              <b className="font-semibold text-accent">이중 확인</b>과{" "}
              <b className="font-semibold text-accent">검색 상승</b>만 실행 후보로 봅니다.
            </p>

            <div className="nt-scroll overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-semibold">후보 키워드</th>
                    <th className="py-2.5 font-semibold">검색 검증 (데이터랩)</th>
                    <th className="py-2.5 font-semibold">구매 의향 (쇼핑)</th>
                    <th className="py-2.5 text-center font-semibold">종합</th>
                    <th className="py-2.5 text-right font-semibold">제조사 찾기</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const v = verdictOf(r);
                    const vm = VERDICT_META[v];
                    const sm = STATUS_META[r.searchStatus];
                    return (
                      <tr key={r.term} className="border-b border-[#f0eee9] last:border-0">
                        <td className="py-3 pr-2">
                          <span className="font-semibold text-accent-ink">{r.term}</span>
                          <span className={`ml-2 rounded-full px-2 py-[2px] text-[10.5px] font-bold ${SOURCE_META[r.source].cls}`}>
                            {SOURCE_META[r.source].label}
                          </span>
                          {r.novel && (
                            <span
                              title="과거 3~12개월 유튜브 표본엔 없다가 최근 처음 등장한 단어입니다. 진짜 신조어인지는 별개 — 표본에 없던 일반어도 여기 들어올 수 있습니다."
                              className="ml-1.5 cursor-help rounded-full bg-accent-soft px-2 py-[2px] text-[10.5px] font-bold text-accent"
                            >
                              신규 등장
                            </span>
                          )}
                        </td>
                        <td className={`py-3 text-[13px] ${STATUS_TONE[r.searchStatus]}`}>
                          {r.hasSearch ? (
                            <>
                              {sm.emoji} {sm.label}
                              {r.searchRise !== null && (
                                <span className="ml-1 text-xs">
                                  ({r.searchRise > 0 ? "+" : ""}
                                  {Math.round(r.searchRise)}%)
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted">검색 데이터 없음</span>
                          )}
                        </td>
                        <td className="py-3 text-[13px]">
                          {(() => {
                            const g = shopGrade(r.shop);
                            const m = SHOP_META[g];
                            return (
                              <span className={g === "rising" ? "font-bold text-accent" : "text-muted"}>
                                {m.label}
                                {g === "rising" && r.shop?.riseRate != null && (
                                  <span className="ml-1 text-xs">
                                    (+{Math.round(r.shop.riseRate)}%)
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[vm.tone]}`}>
                            {vm.label}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <OdmLink term={r.term} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-2 border-t border-line pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <Legend
                tone="good"
                label="삼중 확인"
                desc="검색 상승 + 쇼핑 클릭도 상승 — 관심이 구매 의향까지 이어짐. 가장 강한 신호"
              />
              <Legend tone="good" label="이중 확인" desc="콘텐츠 신조어 + 검색 상승 (쇼핑은 미확인)" />
              <Legend tone="good" label="검색 상승" desc="검색이 실제로 오르는 중 (신조어 여부 무관)" />
              <Legend
                tone="muted"
                label="검색 미상승"
                desc="검색 트렌드가 아직 상승(+5% 이상)으로 확인되지 않음 — 유지·하락이거나 검색 데이터 자체가 없음. 절대 검색량이 적다는 뜻이 아님. 관망."
              />
            </div>

            <div className="mt-4 rounded-xl border border-line bg-[#fbfaf7] p-4 text-xs leading-relaxed text-muted">
              <p className="mb-1 font-semibold text-muted-strong">상승률 계산식</p>
              <p className="font-mono text-[11.5px] text-muted-strong">
                상승률(%) = (최근 2주 평균 − 이전 2주 평균) ÷ 이전 2주 평균 × 100
              </p>
              <ul className="mt-1.5 space-y-0.5">
                <li>· 검색 검증 칸 괄호 안의 % 가 이 값입니다.</li>
                <li>· 네이버 데이터랩 &lsquo;검색어 트렌드&rsquo; 주간 지수 기준 (유튜브·쇼핑 아님)</li>
                <li>· 한 주 노이즈를 줄이려 2주씩 묶어 평균냅니다.</li>
                <li>· 급상승 +30% 이상 · 상승 +5% 이상 · 유지 −5~+5% · 하락 −5% 이하</li>
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 text-xs leading-relaxed text-muted">
            <h3 className="mb-2 text-sm font-semibold text-muted-strong">이 방식이 keywordstool보다 나은 점</h3>
            <ul className="space-y-1.5">
              <li>
                <b className="font-semibold text-muted-strong">신조어 커버리지</b> — 두바이초콜릿·왁뿌소금빵처럼
                시드와 어휘가 안 겹치는 제품명도 영상 제목에 등장하면 잡습니다. keywordstool은 못 잡습니다.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">선행성</b> — 백테스트에서 콘텐츠가 검색을 6개월
                앞선 경우(탕후루)가 있었습니다. 콘텐츠를 먼저 보면 더 일찍 잡습니다.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">이중 검증</b> — 콘텐츠 노이즈(1회성 영상)는 검색
                급상승 검증에서 걸러집니다. 둘 다 뜬 것만 신뢰합니다.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">한계</b> — 한국어 형태소 분석기 없이 조사 제거로
                처리하므로 IP·캐릭터명(포켓몬 등) 일부 노이즈가 남을 수 있고, YouTube 쿼터를 씁니다.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Legend({
  tone,
  label,
  desc,
}: {
  tone: "good" | "mid" | "muted" | "bad";
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 rounded-full px-2 py-[2px] font-bold ${TONE[tone]}`}>{label}</span>
      <span className="text-muted">{desc}</span>
    </div>
  );
}

function Kpi({ label, value, sub, emphasis }: { label: string; value: string; sub: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis ? "border-accent-bright/40 bg-accent-soft/40" : "border-line bg-white"}`}>
      <p className="text-[12.5px] font-semibold text-muted-strong">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold leading-none tracking-tight ${emphasis ? "text-accent" : ""}`}>{value}</p>
      <p className="mt-2 truncate text-xs text-muted">{sub}</p>
    </div>
  );
}
