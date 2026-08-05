"use client";

import { useState } from "react";
import type { Keyword, WeekPoint } from "@/lib/types";
import { fetchCandidates } from "@/lib/discovery";
import { fetchDataLab } from "@/lib/datalab";
import { fetchCoMention, MIN_CO_MENTION } from "@/lib/co-mention";
import { statusOf, trendFromWeeks, type TrendStatus } from "@/lib/trend";
import { formatCount, formatPct, pctColor } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

interface Row {
  name: string;
  volumeTotal: number;
  riseRate: number | null;
  status: TrendStatus;
  /** 함께 언급된 문서 수 (null = 검증 불가) */
  coDocs: number | null;
  ytHits: number;
  igHits: number;
}

const TOP_N = 12;

export function CoKeywords({ keyword }: { keyword: Keyword }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [sources, setSources] = useState({ yt: 0, ig: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setWarn(null);
    try {
      const related = (await fetchCandidates([keyword.name]))
        .filter((c) => c.name !== keyword.name)
        .slice(0, TOP_N);
      if (!related.length) {
        setRows([]);
        return;
      }

      // 상승률 (데이터랩)
      const weeksByName: Record<string, WeekPoint[]> = {};
      try {
        const results = await fetchDataLab(related.map((c) => c.name));
        for (const r of results) {
          weeksByName[r.title] = r.data.map((d) => ({
            period: d.period,
            ratio: d.ratio,
          }));
        }
      } catch {
        // 상승률 실패해도 진행
      }

      // 동시언급 검증 (YouTube 제목·설명 + Instagram 캡션)
      const coByName: Record<string, { docs: number; yt: number; ig: number }> = {};
      let docs = 0;
      let coFailed = false;
      try {
        const cm = await fetchCoMention(
          keyword.name,
          related.map((c) => c.name),
        );
        docs = cm.docCount;
        setSources({ yt: cm.ytCount, ig: cm.igCount });
        for (const r of cm.results) {
          coByName[r.term] = { docs: r.docs, yt: r.ytHits, ig: r.igHits };
        }
        if (cm.ytError) {
          setWarn(`YouTube 텍스트는 건너뛰고 Instagram 캡션만으로 검증했습니다. (${cm.ytError.slice(0, 60)})`);
        }
      } catch (e) {
        coFailed = true;
        setWarn(
          `동시언급 검증을 건너뛰었습니다: ${
            e instanceof Error ? e.message : "요청 실패"
          }`,
        );
      }
      setDocCount(docs);

      const built: Row[] = related.map((c) => {
        const t = trendFromWeeks(weeksByName[c.name] ?? []);
        const co = coByName[c.name];
        return {
          name: c.name,
          volumeTotal: c.volumeTotal,
          riseRate: t.riseRate,
          status: t.riseRate === null ? "none" : statusOf(t.riseRate),
          coDocs: coFailed ? null : (co?.docs ?? 0),
          ytHits: co?.yt ?? 0,
          igHits: co?.ig ?? 0,
        };
      });

      // 검증된 것 먼저(언급 많은 순), 나머지는 검색량 순
      built.sort((a, b) => {
        const va = (a.coDocs ?? 0) >= MIN_CO_MENTION ? 1 : 0;
        const vb = (b.coDocs ?? 0) >= MIN_CO_MENTION ? 1 : 0;
        if (va !== vb) return vb - va;
        if (va === 1) return (b.coDocs ?? 0) - (a.coDocs ?? 0);
        return b.volumeTotal - a.volumeTotal;
      });
      setRows(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : "동반 키워드 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const verified = rows?.filter((r) => (r.coDocs ?? 0) >= MIN_CO_MENTION) ?? [];

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-strong">
          동반 키워드 <span className="font-normal text-muted">(함께 뜨는 연관어)</span>
        </h2>
        <button
          onClick={analyze}
          disabled={loading}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:text-accent disabled:opacity-50"
        >
          {loading ? "분석 중…" : rows ? "다시 분석" : "분석"}
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        연관 검색어를 뽑은 뒤, <b className="font-semibold text-muted-strong">{keyword.name}</b>{" "}
        영상의 제목·설명에서 <b className="font-semibold text-muted-strong">실제로 함께 언급되는지</b>{" "}
        한 번 더 검증합니다. (검색 동반 상승 ≠ 소비자 인식 조합)
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-down-soft px-3 py-2 text-xs text-down">{error}</p>
      )}
      {warn && (
        <p className="mb-3 rounded-lg bg-[#fbf3de] px-3 py-2 text-xs text-[#8a6a00]">{warn}</p>
      )}

      {rows === null ? (
        <p className="py-6 text-center text-sm text-muted">
          “분석”을 눌러 동반 상승 키워드를 확인하세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">연관 키워드를 찾지 못했습니다.</p>
      ) : (
        <>
          {verified.length > 0 ? (
            <div className="mb-3 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              ✅ 실제로 함께 언급됨:{" "}
              <b className="font-semibold">
                {verified.slice(0, 5).map((r) => r.name).join(" · ")}
              </b>
              {docCount > 0 && (
                <span className="text-muted-strong">
                  {" "}
                  (YouTube {sources.yt}건 + Instagram 캡션 {sources.ig}건 = {docCount}건 기준)
                </span>
              )}
            </div>
          ) : (
            docCount > 0 && (
              <div className="mb-3 rounded-xl bg-[#f0eee9] px-3 py-2 text-xs text-muted-strong">
                영상 {docCount}건에서 {MIN_CO_MENTION}건 이상 함께 언급된 키워드가
                없습니다. 아래는 <b>검색 동반 상승</b>일 가능성이 큽니다.
              </div>
            )
          )}

          <div className="overflow-hidden rounded-xl border border-line-soft">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fcfbf8] text-left text-[11.5px] text-muted">
                <tr>
                  <th className="px-3 py-2 font-bold">연관 키워드</th>
                  <th
                    className="cursor-help px-3 py-2 text-center font-bold"
                    title={`${keyword.name} 영상의 제목·설명에서 함께 언급된 건수 (${MIN_CO_MENTION}건 이상이면 검증됨)`}
                  >
                    함께 언급
                  </th>
                  <th className="px-3 py-2 text-right font-bold">월 검색량</th>
                  <th className="px-3 py-2 text-right font-bold">상승률</th>
                  <th className="px-3 py-2 text-center font-bold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => {
                  const ok = (r.coDocs ?? 0) >= MIN_CO_MENTION;
                  return (
                    <tr key={r.name} className={ok ? "bg-[#fafdf3]" : "hover:bg-[#fcfbf6]"}>
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2 text-center">
                        {r.coDocs === null ? (
                          <span className="text-xs text-muted">—</span>
                        ) : ok ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink"
                            title={`YouTube ${r.ytHits}건 · Instagram 캡션 ${r.igHits}건`}
                          >
                            ✅ {r.coDocs}건
                            {r.igHits > 0 && (
                              <span className="font-semibold text-[#7aa33f]">IG {r.igHits}</span>
                            )}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[#f0eee9] px-2 py-0.5 text-[11px] font-semibold text-muted"
                            title={`YouTube ${r.ytHits}건 · Instagram 캡션 ${r.igHits}건 — 검색만 함께 오름(시즌·프로모션 노이즈 의심)`}
                          >
                            ⚠️ {r.coDocs}건
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#3b382f]">
                        {formatCount(r.volumeTotal)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold tabular-nums ${pctColor(r.riseRate)}`}
                      >
                        {formatPct(r.riseRate)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">
            ✅ <b className="font-semibold">검증됨</b> = {keyword.name} 영상 텍스트에{" "}
            {MIN_CO_MENTION}건 이상 함께 등장 → 실제 소비자 인식 조합 ·{" "}
            ⚠️ <b className="font-semibold">미검증</b> = 검색만 동반 상승 (계절·프로모션 노이즈 의심)
          </p>
        </>
      )}
    </section>
  );
}
