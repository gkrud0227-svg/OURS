"use client";

import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { fetchDataLab } from "@/lib/datalab";
import { fetchCandidates } from "@/lib/discovery";
import { trendFromWeeks, gateByLevel, STATUS_META, type TrendStatus } from "@/lib/trend";
import { formatCount } from "@/lib/format";
import { fetchFoodNews, logArticleTerms, type NewsTerm } from "@/lib/trend-radar";

/** 국내 키워드 검증 결과 — 네이버 데이터랩 상승세 + 검색광고 검색량. */
interface Verdict {
  riseRate: number | null;
  status: TrendStatus;
  volumeTotal: number;
  hasData: boolean;
}

/** 검색 증거로 "트렌드"라 볼 수 있나 — 상승 중이거나 검색량이 유의미. */
function isValidated(v: Verdict): boolean {
  return v.hasData && (v.status === "surge" || v.status === "up" || v.volumeTotal >= 5000);
}

const MAX_OVERSEAS_SEEDS = 10;
const MAX_DOMESTIC_SEEDS = 8;

/** 라틴 문자가 있으면 해외(영문), 없으면 국내(한글) 키워드. addTerm 라우팅과 동일 기준. */
const isOverseasTerm = (term: string) => /[a-z]/i.test(term);

function NewsChip({ t, added, onAdd }: { t: NewsTerm; added: boolean; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      disabled={added}
      title={`${t.sources.join(" · ")}\n예: ${t.sample}`}
      className={`cursor-help rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        added
          ? "border-line bg-[#f0eee9] text-muted"
          : t.novelty === "new" || t.novelty === "rising"
            ? "border-[#e6c3ae] bg-[#fbeede] text-[#a5591f] hover:brightness-95"
            : t.sources.length >= 3
              ? "border-[#c9e09a] bg-accent-soft text-accent-ink hover:brightness-95"
              : "border-[#dfebc6] text-[#4e8b10] hover:bg-accent-soft"
      }`}
    >
      {added ? "✓ " : t.novelty === "new" ? "🆕 " : t.novelty === "rising" ? "📈 " : "+ "}
      {t.term}
      <span className="ml-1 rounded bg-white/60 px-1 text-[10px] font-bold text-[#3e6db0]">
        {t.sources.length}곳
      </span>
    </button>
  );
}

function ValidatedChip({
  term,
  v,
  added,
  onAdd,
}: {
  term: string;
  v: Verdict;
  added: boolean;
  onAdd: () => void;
}) {
  const rising = v.status === "surge" || v.status === "up";
  return (
    <button
      onClick={onAdd}
      disabled={added}
      title={`검색 ${STATUS_META[v.status].label}${v.volumeTotal ? ` · 월 검색량 ${v.volumeTotal.toLocaleString()}` : ""}`}
      className={`cursor-help rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        added
          ? "border-line bg-[#f0eee9] text-muted"
          : rising
            ? "border-[#c9e09a] bg-accent-soft text-accent-ink hover:brightness-95"
            : "border-line text-muted-strong hover:bg-[#f2f0eb]"
      }`}
    >
      {added ? "✓ " : `${STATUS_META[v.status].emoji} `}
      {term}
      {rising && v.riseRate != null && (
        <span className="ml-1 text-[10px] font-bold text-[#4e8b10]">+{Math.round(v.riseRate)}%</span>
      )}
      {v.volumeTotal > 0 && (
        <span className="ml-1 rounded bg-white/60 px-1 text-[10px] font-bold text-[#3e6db0]">
          {formatCount(v.volumeTotal)}
        </span>
      )}
    </button>
  );
}

export default function RadarPage() {
  const { overseasSeeds, setOverseasSeeds, seeds, setSeeds } = useStore();
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "key"; text: string } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [news, setNews] = useState<NewsTerm[] | null>(null);
  const [newsMeta, setNewsMeta] = useState<{
    scanned: string[];
    failed: string[];
    crawled?: number;
    articles?: number;
  } | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  /** 국내 키워드 검증 결과(term → Verdict). null=아직 검증 안 함. */
  const [verdicts, setVerdicts] = useState<Record<string, Verdict> | null>(null);
  const [validating, setValidating] = useState(false);

  /** 스캔한 국내(한글) 키워드를 네이버 데이터랩(상승세)+검색광고(검색량)로 검증. */
  async function validateDomestic() {
    if (!news) return;
    const koTerms = [...new Set(news.filter((t) => !isOverseasTerm(t.term)).map((t) => t.term))].slice(
      0,
      30,
    );
    if (!koTerms.length) {
      setMsg({ kind: "error", text: "검증할 국내(한글) 키워드가 없습니다." });
      return;
    }
    setValidating(true);
    setMsg(null);
    try {
      // ① 데이터랩 검색 추이 (6개월 창 — 레벨 게이트가 바닥 노이즈를 거른다)
      const lookback = new Date();
      lookback.setMonth(lookback.getMonth() - 6);
      const weeksByName: Record<string, { period: string; ratio: number }[]> = {};
      try {
        const results = await fetchDataLab(koTerms, { startDate: lookback.toISOString().slice(0, 10) });
        for (const r of results) weeksByName[r.title] = r.data;
      } catch {
        /* 데이터랩 실패해도 검색량만으로 진행 */
      }
      // ② 검색광고 월 검색량 (best-effort)
      const volByName: Record<string, number> = {};
      try {
        for (const r of await fetchCandidates(koTerms)) volByName[r.name] = r.volumeTotal;
      } catch {
        /* 검색광고 실패해도 추이만으로 진행 */
      }

      const out: Record<string, Verdict> = {};
      for (const term of koTerms) {
        const weeks = weeksByName[term] ?? [];
        const t = trendFromWeeks(weeks);
        out[term] = {
          riseRate: t.riseRate,
          status: weeks.length ? gateByLevel(t.status, weeks) : "none",
          volumeTotal: volByName[term] ?? 0,
          hasData: weeks.length > 0 || (volByName[term] ?? 0) > 0,
        };
      }
      setVerdicts(out);
      const pass = Object.values(out).filter(isValidated).length;
      setMsg({
        kind: "ok",
        text: `국내 ${koTerms.length}개 검증 — 검색 증거 있는 ${pass}개만 남김(상승세/검색량).`,
      });
    } finally {
      setValidating(false);
    }
  }

  async function runNews() {
    setNewsLoading(true);
    setMsg(null);
    setVerdicts(null); // 새로 스캔하면 이전 검증 결과 초기화
    try {
      const r = await fetchFoodNews();
      if (r.error) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setNews(r.terms);
      setNewsMeta({ scanned: r.scanned, failed: r.failed, crawled: r.crawled, articles: r.articles });
      const nNew = r.terms.filter((t) => t.novelty === "new").length;
      const nRise = r.terms.filter((t) => t.novelty === "rising").length;
      const crawlNote = r.crawled != null ? ` · 기사 ${r.crawled}건 크롤링` : "";
      setMsg({
        kind: "ok",
        text: r.baselineJustSet
          ? `첫 스캔 — 기준선을 설정했습니다. 다음 스캔부터 신규·급부상 단어가 자동 부각됩니다.${crawlNote}`
          : `${r.scanned.length}개 매체 · 신규 ${nNew} · 급부상 ${nRise}${crawlNote}`,
      });
    } finally {
      setNewsLoading(false);
    }
  }

  /** 라틴 글자가 있으면 해외(US·GB), 아니면 국내(KR) 시드로 라우팅. */
  function addTerm(term: string) {
    const isEn = /[a-z]/i.test(term);
    if (isEn) {
      const merged = [...overseasSeeds];
      if (!merged.some((s) => s.toLowerCase() === term.toLowerCase())) merged.push(term);
      setOverseasSeeds(merged.slice(0, MAX_OVERSEAS_SEEDS));
    } else {
      const t = term.replace(/\s+/g, " ").trim();
      const merged = [...seeds];
      if (!merged.some((s) => s === t)) merged.push(t);
      setSeeds(merged.slice(0, MAX_DOMESTIC_SEEDS));
    }
    void logArticleTerms([term]);
    setAdded((prev) => new Set(prev).add(term));
    setMsg({
      kind: "ok",
      text: `"${term}"을(를) ${isEn ? "해외" : "국내"} 시드에 추가했습니다. 다음 키워드 발굴부터 추적됩니다.`,
    });
  }

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">식품 뉴스 스캔</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            국내·해외 매체
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          국내·해외 식품 매체의 <b className="font-medium">최신 기사 본문을 자동 크롤링</b>해 트렌드 키워드를
          뽑고, 국내 키워드는 <b className="font-medium">네이버 검색으로 검증</b>합니다. 뽑은 키워드는 발굴 시드에
          넣어 추적합니다. <span className="text-muted">(국내 시드 {seeds.length} · 해외 시드 {overseasSeeds.length})</span>
        </p>
      </header>

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            msg.kind === "error"
              ? "bg-down-soft text-down"
              : msg.kind === "key"
                ? "bg-[#fbf3de] text-[#8a6a00]"
                : "bg-accent-soft text-accent-ink"
          }`}
        >
          {msg.text}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-muted-strong">식품 뉴스 스캔 (국내·해외)</h2>
            <p className="text-xs text-muted">
              국내(식품저널 등)·해외(Guardian 등) 식품 매체의 <b className="font-semibold">최신 기사 본문까지
              자동 크롤링</b>해 키워드만 뽑습니다. <b className="font-semibold">이전에 없던(🆕)·여러 매체로
              번진(📈)</b> 단어를 자동 부각합니다. 결과는 <b className="font-semibold">국내(한글)·해외(영문)</b>로
              나눠 보여주고, 한글은 국내·영어는 해외 시드로 들어갑니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {news && news.some((t) => !isOverseasTerm(t.term)) && (
              <button
                onClick={validateDomestic}
                disabled={validating || newsLoading}
                style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
                className="h-9 rounded-[10px] px-3.5 text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-50"
              >
                {validating ? "검증 중…" : "국내 키워드 네이버 검증"}
              </button>
            )}
            <button
              onClick={runNews}
              disabled={newsLoading}
              className="h-9 rounded-[10px] border border-accent-bright px-3.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
            >
              {newsLoading ? "스캔 중…" : "지금 스캔"}
            </button>
          </div>
        </div>
        {newsMeta && (
          <p className="mb-2 text-[11px] text-muted">
            스캔: {newsMeta.scanned.join(", ") || "—"}
            {newsMeta.crawled != null && ` · 기사 본문 ${newsMeta.crawled}/${newsMeta.articles}건 크롤링`}
            {newsMeta.failed.length > 0 && ` · 실패: ${newsMeta.failed.join(", ")}`}
          </p>
        )}
        {news && news.length > 0 && (
          <div className="space-y-3">
            {(["국내", "해외"] as const).map((group) => {
              const list = news.filter((t) =>
                group === "해외" ? isOverseasTerm(t.term) : !isOverseasTerm(t.term),
              );
              if (!list.length) return null;

              // 국내 + 검증 완료 → 검색 증거(상승세·검색량) 있는 것만, 상승률 순으로.
              if (group === "국내" && verdicts) {
                const passed = list
                  .map((t) => ({ t, v: verdicts[t.term] }))
                  .filter((x) => x.v && isValidated(x.v))
                  .sort((a, b) => (b.v.riseRate ?? -999) - (a.v.riseRate ?? -999));
                return (
                  <div key={group}>
                    <p className="mb-1.5 text-[11px] font-bold text-muted-strong">
                      국내 · 네이버 검증 통과{" "}
                      <span className="font-normal text-muted">
                        ({passed.length}/{list.length}) — 🔥급상승 📈상승 · +상승률 · 월검색량
                      </span>
                    </p>
                    {passed.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {passed.map(({ t, v }) => (
                          <ValidatedChip
                            key={t.term}
                            term={t.term}
                            v={v}
                            added={added.has(t.term)}
                            onAdd={() => addTerm(t.term)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        검색 증거(상승세·검색량)가 있는 국내 키워드가 없습니다 — 이번 스캔은 노이즈였을 수
                        있어요. (신조어는 아직 검색 이력이 없어 여기서 안 잡힐 수 있습니다)
                      </p>
                    )}
                  </div>
                );
              }

              return (
                <div key={group}>
                  <p className="mb-1.5 text-[11px] font-bold text-muted-strong">
                    {group} <span className="font-normal text-muted">({list.length})</span>
                    {group === "국내" && (
                      <span className="font-normal text-muted"> — &ldquo;네이버 검증&rdquo;으로 노이즈 제거</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((t) => (
                      <NewsChip key={t.term} t={t} added={added.has(t.term)} onAdd={() => addTerm(t.term)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {news && news.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">후보어를 찾지 못했습니다.</p>
        )}
      </section>
    </div>
  );
}
