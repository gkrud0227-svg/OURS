"use client";

import { useState, useEffect } from "react";
import {
  fetchLogLabels,
  fetchDemoLabels,
  type LabelResponse,
  type LabelResult,
  type BucketStat,
} from "@/lib/label-client";
import {
  fetchSignalWeights,
  recomputeSignalWeights,
  type SignalWeights,
} from "@/lib/weights-client";

/**
 * 발굴 라벨링(1단계) — 전향적 로그의 각 후보를, 발견 이후 검색이 실제로 떴는지로
 * hit/dud/pending 판정하고 **오탐률(FDR)·정밀도**를 낸다. 판정기는 백테스트와 동일.
 */

// 데모 프리셋 — 과거 실제 사례를 "그 부상 직전 시점에 발견했다면" 으로 재구성.
// (실제 로그가 아니라 개념 시연용 입력 — 진짜 로그는 아래 '실제 로그 라벨링'.)
const DEMO_PRESET = [
  "탕후루, 2023-06-01",
  "요아정, 2024-01-01",
  "밤티라미수, 2024-09-01",
  "냅킨, 2023-06-01",
  "책상, 2023-06-01",
  "김치, 2023-06-01",
].join("\n");

// 가중치 데모 — 출처를 갈라(autocomplete=고정밀 4/5, article=저정밀 0/5) 자기강화가
// 실제로 도는지 보여준다. 로그가 성숙하기 전에도 개념 시연 가능(저장 안 함).
const WEIGHT_DEMO: { term: string; firstSeenAt: string; source: string }[] = [
  { term: "탕후루", firstSeenAt: "2023-06-01", source: "autocomplete" },
  { term: "요아정", firstSeenAt: "2024-01-01", source: "autocomplete" },
  { term: "밤티라미수", firstSeenAt: "2024-09-01", source: "autocomplete" },
  { term: "두바이 초콜릿", firstSeenAt: "2024-04-01", source: "autocomplete" },
  { term: "책상", firstSeenAt: "2023-06-01", source: "autocomplete" },
  { term: "냅킨", firstSeenAt: "2023-06-01", source: "article" },
  { term: "김치", firstSeenAt: "2023-06-01", source: "article" },
  { term: "라면", firstSeenAt: "2023-06-01", source: "article" },
  { term: "스테이플러", firstSeenAt: "2023-06-01", source: "article" },
  { term: "먹태깡", firstSeenAt: "2023-09-01", source: "article" },
];

const TONE = {
  hit: "bg-accent-soft text-accent",
  dud: "bg-down-soft text-down",
  pending: "bg-[#f0eee9] text-muted",
} as const;

const LABEL_KO = { hit: "적중(hit)", dud: "오탐(dud)", pending: "관찰 중" } as const;

export default function LabelPage() {
  const [demoText, setDemoText] = useState(DEMO_PRESET);
  const [data, setData] = useState<LabelResponse | null>(null);
  const [mode, setMode] = useState<"demo" | "log" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<SignalWeights | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchSignalWeights()
      .then(setWeights)
      .catch(() => {});
  }, []);

  async function recompute(demo?: { term: string; firstSeenAt: string; source: string }[]) {
    setRecomputing(true);
    setWeightsMsg(null);
    try {
      const r = await recomputeSignalWeights(demo);
      if (r.error) {
        setWeightsMsg(r.error);
        return;
      }
      if (r.weights) setWeights(r.weights);
      setWeightsMsg(
        r.demo
          ? `데모 학습 — 라벨 ${r.labeled ?? 0}건으로 계산(저장 안 함)`
          : (r.note ?? `재학습 완료 — 라벨 ${r.labeled ?? 0}건 반영`),
      );
    } finally {
      setRecomputing(false);
    }
  }

  function parseDemo(): { term: string; firstSeenAt: string }[] {
    return demoText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [term, date] = line.split(",").map((s) => s.trim());
        return { term, firstSeenAt: date || "2023-06-01" };
      })
      .filter((e) => e.term);
  }

  async function run(kind: "demo" | "log") {
    setLoading(true);
    setError(null);
    setMode(kind);
    try {
      const res = kind === "demo" ? await fetchDemoLabels(parseDemo()) : await fetchLogLabels();
      if (res.error) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "라벨링에 실패했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data?.summary;

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">발굴 라벨링</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            오탐률·정밀도
          </span>
          <span className="rounded-full bg-[#fbf3de] px-2.5 py-[3px] text-[11px] font-bold text-[#8a6a00]">
            1단계 프로토타입
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          전향적 로그의 각 후보를 <b className="font-medium">발견 시점 이후</b> 데이터랩 검색 곡선이
          실제로 떴는지로 <b className="font-medium">적중(hit)·오탐(dud)·관찰 중(pending)</b> 판정합니다.
          판정기는 백테스트와 <b className="font-medium">동일</b>(전주 대비 +30%, 4주 MA, 하한 지수 5).
          여기서 처음으로 <b className="font-medium">엔진이 올린 것 전부에 대한 오탐률</b>이 나옵니다 —
          아는 히트만 넣는 백테스트가 못 재던 값입니다.
        </p>
      </header>

      {/* 데모 러너 */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-muted-strong">데모 — 개념 확인</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          한 줄에 <code className="rounded bg-[#f0eee9] px-1">키워드, 발견일(YYYY-MM-DD)</code>. 과거
          사례를 &ldquo;그 부상 직전에 발견했다면&rdquo;으로 넣어 봅니다. 히트(탕후루 등)는 hit,
          일반어(책상 등)는 dud로 찍혀야 개념이 도는 겁니다. <b className="font-medium">실제 로그는 건드리지
          않습니다.</b>
        </p>
        <textarea
          value={demoText}
          onChange={(e) => setDemoText(e.target.value)}
          rows={6}
          className="mb-3 w-full rounded-[10px] border border-line p-3 font-mono text-[12.5px] outline-none focus:border-accent-bright"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => run("demo")}
            disabled={loading}
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="h-10 rounded-[10px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          >
            {loading && mode === "demo" ? "라벨링 중…" : "데모 라벨링"}
          </button>
          <button
            onClick={() => run("log")}
            disabled={loading}
            className="h-10 rounded-[10px] border border-accent-bright px-5 text-sm font-bold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {loading && mode === "log" ? "라벨링 중…" : "실제 로그 라벨링"}
          </button>
          <span className="text-xs text-muted">
            데이터랩 단독 조회라 키워드 수만큼 시간이 걸립니다.
          </span>
        </div>
      </section>

      {/* 3단계 — 학습된 신호 가중치 */}
      <WeightsPanel
        weights={weights}
        recomputing={recomputing}
        msg={weightsMsg}
        onRecompute={() => recompute()}
        onDemo={() => recompute(WEIGHT_DEMO)}
      />

      {error && <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{error}</div>}
      {data?.note && !error && (
        <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-sm text-[#8a6a00]">{data.note}</div>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="오탐률 (FDR)"
              value={s.fdr !== null ? `${Math.round(s.fdr * 100)}%` : "—"}
              sub={`dud ${s.dud} / 성숙 ${s.matured}건`}
              emphasis
            />
            <Kpi
              label="정밀도"
              value={s.precision !== null ? `${Math.round(s.precision * 100)}%` : "—"}
              sub={`hit ${s.hit} / 성숙 ${s.matured}건`}
            />
            <Kpi label="성숙 표본" value={`${s.matured}건`} sub={`창(window) ${data?.window ?? 8}주 기준`} />
            <Kpi label="관찰 중" value={`${s.pending}건`} sub="아직 판정 이른 후보(분모 제외)" />
          </div>

          {(s.bySource.length > 0 || s.byNovel.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <BucketTable title="출처별 오탐률" rows={s.bySource} />
              <BucketTable title="신규 등장 여부별 오탐률" rows={s.byNovel} />
            </div>
          )}

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-strong">라벨링 결과</h2>
            <div className="nt-scroll overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-semibold">키워드</th>
                    <th className="py-2.5 font-semibold">발견일</th>
                    <th className="py-2.5 font-semibold">출처</th>
                    <th className="py-2.5 text-right font-semibold">발견 후 상승률</th>
                    <th className="py-2.5 text-right font-semibold">피크까지</th>
                    <th className="py-2.5 font-semibold">근거</th>
                    <th className="py-2.5 text-center font-semibold">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(data?.results ?? [])]
                    .sort((a, b) => rank(b) - rank(a))
                    .map((r) => (
                      <ResultRow key={`${r.term}-${r.firstSeenAt}`} r={r} />
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 text-xs leading-relaxed text-muted">
            <h3 className="mb-2 text-sm font-semibold text-muted-strong">읽는 법 · 한계</h3>
            <ul className="space-y-1.5">
              <li>
                <b className="font-semibold text-muted-strong">오탐률 = dud / 성숙</b> — 우리가 신호라 부른 것
                중 헛방 비율(FDR). 고전적 FPR은 &ldquo;안 뜬 세상 모든 단어&rdquo;가 분모라 계산 불가.
              </li>
              <li>
                <b className="font-semibold text-muted-strong">관찰 중은 분모에서 제외</b> — 발견 후 창(
                {data?.window ?? 8}주)이 안 지난 후보를 dud로 세면 오탐률이 부풀려집니다(censoring).
              </li>
              <li>
                <b className="font-semibold text-muted-strong">데이터랩=검색 피크는 프록시</b> — 매출이 아니라
                일관된 객관 라벨입니다. 출처·신규여부 버킷의 오탐률 차이가 3단계 가중치 학습의 연료입니다.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

/** 정렬 우선순위: hit > dud > pending. */
function rank(r: LabelResult): number {
  return r.label === "hit" ? 2 : r.label === "dud" ? 1 : 0;
}

function ResultRow({ r }: { r: LabelResult }) {
  return (
    <tr className="border-b border-[#f0eee9] last:border-0">
      <td className="py-3 pr-2 font-semibold text-accent-ink">{r.term}</td>
      <td className="py-3 text-[13px] text-muted-strong">{r.firstSeenAt.slice(0, 10)}</td>
      <td className="py-3 text-[13px] text-muted">{r.source ?? "—"}</td>
      <td className="py-3 text-right text-[13px] tabular-nums text-muted-strong">
        {r.riseAfterPct !== null ? `${r.riseAfterPct > 0 ? "+" : ""}${r.riseAfterPct}%` : "—"}
      </td>
      <td className="py-3 text-right text-[13px] tabular-nums text-muted">
        {r.weeksToPeak !== null ? `${r.weeksToPeak}주` : "—"}
      </td>
      <td className="py-3 text-[12px] text-muted">{r.reason}</td>
      <td className="py-3 text-center">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[r.label]}`}>
          {LABEL_KO[r.label]}
        </span>
      </td>
    </tr>
  );
}

function WeightsPanel({
  weights,
  recomputing,
  msg,
  onRecompute,
  onDemo,
}: {
  weights: SignalWeights | null;
  recomputing: boolean;
  msg: string | null;
  onRecompute: () => void;
  onDemo: () => void;
}) {
  const neutral =
    !weights ||
    (Object.keys(weights.bySource).length === 0 && Object.keys(weights.byNovel).length === 0);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-strong">
          학습된 신호 가중치 <span className="font-normal text-muted">(3단계 — 발굴 점수에 반영)</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onDemo}
            disabled={recomputing}
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="h-9 rounded-[10px] px-3.5 text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-50"
          >
            {recomputing ? "학습 중…" : "데모 학습"}
          </button>
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="h-9 rounded-[10px] border border-accent-bright px-3.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
          >
            {recomputing ? "재학습 중…" : "실제 로그로 재학습"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        라벨링 결과(버킷별 오탐률)로 <b className="font-medium">출처·신규여부별 신뢰 배수</b>를 학습해 발굴
        점수에 곱합니다. 전환 잘 되는 신호는 가산, 헛방 많은 신호는 감산. 성숙 라벨이 부족하면{" "}
        <b className="font-medium">중립(×1.0)</b>이라 발굴 동작은 그대로입니다(안전). <b className="font-medium">
        데모 학습</b>은 출처를 갈라(autocomplete vs article) 자기강화가 실제로 도는지 보여줍니다.
      </p>
      {msg && <p className="mb-2 text-xs text-accent-ink">{msg}</p>}

      {neutral ? (
        <p className="rounded-xl bg-[#f0eee9] px-4 py-3 text-xs leading-relaxed text-muted-strong">
          아직 <b className="font-semibold">학습 전</b> — 성숙 라벨이 부족해(또는 로그가 비어) 모든 가중치가{" "}
          <b className="font-semibold">×1.0(중립)</b>입니다. 발굴이 쌓이고 라벨이 성숙하면 여기 배수가
          움직입니다.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted">
            전역 정밀도{" "}
            {weights!.globalPrecision !== null ? `${Math.round(weights!.globalPrecision * 100)}%` : "—"} ·
            성숙 {weights!.matured}건 · 생성 {weights!.generatedAt.slice(0, 10) || "—"}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <WeightChips title="출처별 배수" map={weights!.bySource} />
            <WeightChips title="신규여부별 배수" map={weights!.byNovel} />
          </div>
        </>
      )}
    </section>
  );
}

function WeightChips({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map);
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold text-muted-strong">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([k, w]) => (
            <span
              key={k}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                w > 1.02
                  ? "border-[#c9e09a] bg-accent-soft text-accent-ink"
                  : w < 0.98
                    ? "border-[#e6c3ae] bg-down-soft text-down"
                    : "border-line text-muted-strong"
              }`}
            >
              {k} <span className="tabular-nums">×{w.toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: BucketStat[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-muted-strong">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">성숙 표본 없음</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-semibold">구분</th>
              <th className="py-2 text-right font-semibold">성숙</th>
              <th className="py-2 text-right font-semibold">hit</th>
              <th className="py-2 text-right font-semibold">dud</th>
              <th className="py-2 text-right font-semibold">오탐률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key} className="border-b border-[#f0eee9] last:border-0">
                <td className="py-2 font-medium text-muted-strong">{b.key}</td>
                <td className="py-2 text-right tabular-nums text-muted">{b.matured}</td>
                <td className="py-2 text-right tabular-nums text-accent">{b.hit}</td>
                <td className="py-2 text-right tabular-nums text-down">{b.dud}</td>
                <td className="py-2 text-right font-bold tabular-nums">
                  {b.fdr !== null ? `${Math.round(b.fdr * 100)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
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
    <div
      className={`rounded-2xl border p-4 ${emphasis ? "border-accent-bright/40 bg-accent-soft/40" : "border-line bg-white"}`}
    >
      <p className="text-[12.5px] font-semibold text-muted-strong">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold leading-none tracking-tight ${emphasis ? "text-accent" : ""}`}>
        {value}
      </p>
      <p className="mt-2 truncate text-xs text-muted">{sub}</p>
    </div>
  );
}
