"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  closeInstagramLocalBrowser,
  collectInstagramLocal,
  exportInstagramLocalCsv,
  getInstagramLocalPaths,
  getInstagramLocalTrend,
  listInstagramLocalItems,
  listInstagramLocalRuns,
  openInstagramLocalBrowser,
  type InstagramLocalItem,
  type InstagramLocalMode,
  type InstagramLocalPaths,
  type InstagramLocalRun,
  type InstagramLocalSummary,
  type InstagramLocalTrend,
  type InstagramLocalTrendGroup,
} from "@/lib/instagram-local";

type Status = { kind: "info" | "ok" | "warn" | "error"; text: string };

const buttonBase =
  "inline-flex min-h-10 items-center justify-center rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "-";
  return `${formatNumber(value)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDelta(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value === 0) return "변화 없음";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}${suffix}`;
}

function shortText(value: string | null | undefined, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function modeLabel(mode: string | undefined) {
  if (mode === "hashtag") return "해시태그";
  if (mode === "keyword") return "키워드";
  return "현재 페이지";
}

function bucketLabel(bucket: string | undefined) {
  if (bucket === "top_screen") return "첫 화면";
  if (bucket === "extended") return "확장";
  return "-";
}

function directionLabel(direction: string, rankDelta?: number | null) {
  if (direction === "new") return "신규";
  if (direction === "up") return `상승 ${formatNumber(rankDelta)}`;
  if (direction === "down") return `하락 ${formatNumber(Math.abs(rankDelta ?? 0))}`;
  return "유지";
}

function statusClass(kind: Status["kind"]) {
  if (kind === "error") return "border-red-200 bg-red-50 text-red-700";
  if (kind === "warn") return "border-[#ead7b8] bg-[#fff8e8] text-[#80612b]";
  if (kind === "ok") return "border-[#dbe9c1] bg-accent-soft text-accent-ink";
  return "border-line bg-white text-muted-strong";
}

function getTerms(input: string) {
  return input
    .split(/\r?\n|,/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function selectedSummary(
  run: InstagramLocalRun | undefined,
  group: InstagramLocalTrendGroup | undefined,
): InstagramLocalSummary {
  return group?.currentSummary ?? run?.summary ?? {};
}

function MetricTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="min-h-[72px] min-w-0 rounded-[8px] border border-line bg-white px-4 py-3">
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {delta && <p className="mt-0.5 text-xs font-semibold text-accent-ink">{delta}</p>}
    </div>
  );
}

export function InstagramLocalClient() {
  const [mode, setMode] = useState<InstagramLocalMode>("keyword");
  const [termsInput, setTermsInput] = useState("");
  const [maxPosts, setMaxPosts] = useState(15);
  const [scrollSteps, setScrollSteps] = useState(1);
  const [delayMs, setDelayMs] = useState(2200);
  const [collectDetails, setCollectDetails] = useState(true);
  const [requireKeywordMatch, setRequireKeywordMatch] = useState(false);

  const [paths, setPaths] = useState<InstagramLocalPaths | null>(null);
  const [runs, setRuns] = useState<InstagramLocalRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedTrendKey, setSelectedTrendKey] = useState("");
  const [trend, setTrend] = useState<InstagramLocalTrend | null>(null);
  const [items, setItems] = useState<InstagramLocalItem[]>([]);
  const [status, setStatus] = useState<Status>({
    kind: "info",
    text: "브라우저를 열고 Instagram에 로그인한 뒤 수집을 시작하세요.",
  });
  const [busy, setBusy] = useState(false);

  const selectedRun = runs.find((run) => run.id === selectedRunId);
  const groups = trend?.groups ?? [];
  const selectedGroup =
    groups.find((group) => group.key === selectedTrendKey) ?? groups[0];
  const summary = selectedSummary(selectedRun, selectedGroup);
  const visibleItems = selectedGroup
    ? items.filter(
        (item) =>
          item.sourceMode === selectedGroup.sourceMode &&
          item.sourceTerm === selectedGroup.sourceTerm,
      )
    : items;

  const historyMax = Math.max(
    1,
    ...(selectedGroup?.history.map((point) => point.avgViews ?? 0) ?? []),
  );

  const refreshData = useCallback(
    async (preferredRunId?: string) => {
      const [{ runs: nextRuns }, nextPaths] = await Promise.all([
        listInstagramLocalRuns(),
        getInstagramLocalPaths(),
      ]);
      const nextRunId = preferredRunId || selectedRunId || nextRuns[0]?.id || "";
      setPaths(nextPaths);
      setRuns(nextRuns);
      setSelectedRunId(nextRunId);

      if (!nextRunId) {
        setItems([]);
        setTrend(null);
        setSelectedTrendKey("");
        return;
      }

      const [{ items: nextItems }, { trend: nextTrend }] = await Promise.all([
        listInstagramLocalItems(nextRunId),
        getInstagramLocalTrend(nextRunId),
      ]);
      setItems(nextItems);
      setTrend(nextTrend);
      const availableGroups = nextTrend?.groups ?? [];
      const stillValid = availableGroups.some((group) => group.key === selectedTrendKey);
      setSelectedTrendKey(stillValid ? selectedTrendKey : availableGroups[0]?.key ?? "");
    },
    [selectedRunId, selectedTrendKey],
  );

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const nextPaths = await getInstagramLocalPaths();
        if (!active) return;
        setPaths(nextPaths);
        await refreshData();
      } catch (error) {
        if (!active) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [refreshData]);

  async function onOpenBrowser() {
    setBusy(true);
    try {
      const result = await openInstagramLocalBrowser();
      setStatus({
        kind: "ok",
        text: `브라우저가 열렸습니다. 현재 주소: ${result.browser.url}`,
      });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onCloseBrowser() {
    setBusy(true);
    try {
      await closeInstagramLocalBrowser();
      setStatus({ kind: "ok", text: "브라우저를 닫았습니다." });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onCollect() {
    const terms = getTerms(termsInput);
    if (!terms.length) {
      setStatus({ kind: "warn", text: "수집할 키워드 또는 해시태그를 입력하세요." });
      return;
    }

    setBusy(true);
    setStatus({ kind: "info", text: "수집을 시작합니다. 열린 브라우저를 조작하지 마세요." });
    try {
      const result = await collectInstagramLocal({
        mode,
        terms,
        maxPostsPerTerm: maxPosts,
        scrollSteps,
        delayMs,
        collectDetails,
        requireKeywordMatch,
        requirePageMatch: true,
      });
      await refreshData(result.run.id);
      const lastProgress = result.progress
        .map((entry) => entry.message)
        .filter(Boolean)
        .slice(-1)[0];
      setStatus({
        kind: "ok",
        text: `완료: ${result.summary.itemCount ?? 0}개 항목을 저장했습니다.${
          lastProgress ? ` (${lastProgress})` : ""
        }`,
      });
    } catch (error) {
      await refreshData();
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!selectedRunId) return;
    setBusy(true);
    try {
      const result = await exportInstagramLocalCsv(selectedRunId);
      setStatus({ kind: "ok", text: `CSV를 저장했습니다: ${result.exportPath}` });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setBusy(true);
    try {
      await refreshData();
      setStatus({ kind: "ok", text: "수집 기록을 새로고침했습니다." });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">
            Local Collector
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Instagram 관측 수집
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-strong">
            로그인된 로컬 브라우저에서 키워드 검색 또는 해시태그 페이지의 상위 게시물을
            관측하고, 반복 수집 결과로 순위 변화와 진입 게시물을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenBrowser}
            disabled={busy}
            className={`${buttonBase} bg-accent text-white hover:bg-accent-strong`}
          >
            브라우저 열기
          </button>
          <button
            type="button"
            onClick={onCloseBrowser}
            disabled={busy}
            className={`${buttonBase} border border-line bg-white text-muted-strong hover:bg-[#f2f0eb]`}
          >
            브라우저 닫기
          </button>
        </div>
      </header>

      <div className={`rounded-[10px] border px-4 py-3 text-sm ${statusClass(status.kind)}`}>
        {status.text}
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-[10px] border border-line bg-white p-5">
          <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-[#f2f0eb] p-1">
            {(["keyword", "hashtag"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors ${
                  mode === value
                    ? "bg-white text-accent-ink shadow-sm"
                    : "text-muted-strong hover:bg-white/60"
                }`}
              >
                {value === "keyword" ? "키워드" : "해시태그"}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted">키워드 또는 해시태그</span>
            <textarea
              value={termsInput}
              onChange={(event) => setTermsInput(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={mode === "keyword" ? "제주카페\n도넛\n팝업스토어" : "제주카페\n도넛"}
              className="mt-2 w-full resize-none rounded-[10px] border border-line bg-[#fffdfa] px-3 py-3 text-sm outline-none transition-colors focus:border-accent"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted">상위 항목</span>
              <input
                type="number"
                min={1}
                max={30}
                value={maxPosts}
                onChange={(event) => setMaxPosts(Number(event.target.value))}
                className="mt-2 h-10 w-full rounded-[9px] border border-line px-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">스크롤</span>
              <input
                type="number"
                min={0}
                max={2}
                value={scrollSteps}
                onChange={(event) => setScrollSteps(Number(event.target.value))}
                className="mt-2 h-10 w-full rounded-[9px] border border-line px-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">대기 ms</span>
              <input
                type="number"
                min={1200}
                max={10000}
                step={100}
                value={delayMs}
                onChange={(event) => setDelayMs(Number(event.target.value))}
                className="mt-2 h-10 w-full rounded-[9px] border border-line px-3 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-[9px] bg-[#fbfaf7] p-3 text-sm text-muted-strong">
            <input
              type="checkbox"
              checked={collectDetails}
              onChange={(event) => setCollectDetails(event.target.checked)}
              className="mt-1 accent-accent"
            />
            <span>상위 게시물 상세 지표를 읽어 조회수, 댓글, 좋아요를 추출</span>
          </label>

          <label className="flex items-start gap-3 rounded-[9px] bg-[#fbfaf7] p-3 text-sm text-muted-strong">
            <input
              type="checkbox"
              checked={requireKeywordMatch}
              onChange={(event) => setRequireKeywordMatch(event.target.checked)}
              className="mt-1 accent-accent"
            />
            <span>본문 또는 미리보기에서 키워드가 확인된 게시물만 저장</span>
          </label>

          <button
            type="button"
            onClick={onCollect}
            disabled={busy}
            className={`${buttonBase} w-full bg-neutral-900 text-white hover:bg-neutral-700`}
          >
            {busy ? "작업 중" : `${modeLabel(mode)} 수집`}
          </button>

          {paths && (
            <div className="space-y-2 border-t border-line pt-4 text-xs leading-5 text-muted">
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                <span className="whitespace-nowrap">프로필</span>
                <code
                  title={paths.browserProfileDir}
                  className="min-w-0 truncate rounded bg-[#f7f5ef] px-2 py-0.5 font-sans text-[11px] text-muted-strong"
                >
                  {paths.browserProfileDir}
                </code>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                <span className="whitespace-nowrap">데이터</span>
                <code
                  title={paths.dbPath}
                  className="min-w-0 truncate rounded bg-[#f7f5ef] px-2 py-0.5 font-sans text-[11px] text-muted-strong"
                >
                  {paths.dbPath}
                </code>
              </div>
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="상위 항목" value={formatNumber(summary.itemCount)} />
            <MetricTile
              label="평균 조회수"
              value={formatNumber(summary.avgViews)}
              delta={formatDelta(selectedGroup?.deltas.avgViews)}
            />
            <MetricTile
              label="평균 댓글"
              value={formatNumber(summary.avgComments)}
              delta={formatDelta(selectedGroup?.deltas.avgComments)}
            />
            <MetricTile
              label="릴스 비중"
              value={formatPercent(summary.reelShare)}
              delta={formatDelta(selectedGroup?.deltas.reelShare, "%")}
            />
            <MetricTile
              label="신규 진입"
              value={selectedGroup?.previousRunId ? formatNumber(selectedGroup.newEntryCount) : "-"}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">수집 세션</h2>
              <p className="mt-1 max-w-full truncate text-xs text-muted" title={selectedRun ? `${selectedRun.status} · ${modeLabel(selectedRun.mode)} · ${selectedRun.terms?.join(", ") || selectedRun.label || "-"} · ${formatDate(selectedRun.startedAt)}` : undefined}>
                {selectedRun
                  ? `${selectedRun.status} · ${modeLabel(selectedRun.mode)} · ${
                      selectedRun.terms?.join(", ") || selectedRun.label || "-"
                    } · ${formatDate(selectedRun.startedAt)}`
                  : "아직 완료된 수집이 없습니다."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <select
                value={selectedRunId}
                onChange={async (event) => {
                  const nextRunId = event.target.value;
                  setSelectedRunId(nextRunId);
                  await refreshData(nextRunId);
                }}
                className="h-10 min-w-0 rounded-[9px] border border-line bg-white px-3 text-sm outline-none focus:border-accent sm:w-auto sm:max-w-[230px]"
              >
                <option value="">세션 선택</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatDate(run.startedAt)} · {run.terms?.join(", ") || run.label || run.mode}
                  </option>
                ))}
              </select>
              <select
                value={selectedTrendKey}
                onChange={(event) => setSelectedTrendKey(event.target.value)}
                className="h-10 min-w-0 rounded-[9px] border border-line bg-white px-3 text-sm outline-none focus:border-accent sm:w-auto sm:max-w-[190px]"
              >
                <option value="">전체</option>
                {groups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {modeLabel(group.sourceMode)} · {group.sourceTerm}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefresh}
                disabled={busy}
                className={`${buttonBase} border border-line bg-white text-muted-strong hover:bg-[#f2f0eb]`}
              >
                새로고침
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={busy || !selectedRunId}
                className={`${buttonBase} border border-line bg-white text-muted-strong hover:bg-[#f2f0eb]`}
              >
                CSV 저장
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-[10px] border border-line bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">히스토리</h3>
                <span className="text-xs text-muted">최근 {selectedGroup?.history.length ?? 0}회</span>
              </div>
              {selectedGroup?.history.length ? (
                <div className="flex h-40 items-end gap-3">
                  {selectedGroup.history.map((point) => {
                    const value = point.avgViews ?? 0;
                    const height = Math.max(8, Math.round((value / historyMax) * 100));
                    return (
                      <div key={point.runId} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                        <div className="flex h-24 w-full items-end rounded-[7px] bg-[#f2f0eb] px-1">
                          <span
                            className={`block w-full rounded-[5px] ${
                              point.runId === selectedRunId ? "bg-accent" : "bg-[#b8c99c]"
                            }`}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <strong className="max-w-full truncate text-xs tabular-nums">
                          {formatNumber(value)}
                        </strong>
                        <small className="max-w-full truncate text-[11px] text-muted">
                          {formatDate(point.startedAt)}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted">
                  같은 키워드를 반복 수집하면 변화가 표시됩니다.
                </p>
              )}
            </div>

            <div className="rounded-[10px] border border-line bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">순위 변화</h3>
                <span className="text-xs text-muted">
                  {selectedGroup?.previousRunId
                    ? `신규 ${formatNumber(selectedGroup.newEntryCount)} · 반복 ${formatNumber(
                        selectedGroup.repeatedEntryCount,
                      )}`
                    : "비교 세션 없음"}
                </span>
              </div>
              {selectedGroup?.previousRunId ? (
                <div className="nt-scroll overflow-auto">
                  <table className="w-full min-w-[680px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[64px]" />
                      <col className="w-[64px]" />
                      <col className="w-[86px]" />
                      <col className="w-[112px]" />
                      <col />
                    </colgroup>
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="whitespace-nowrap pb-2 font-semibold">현재</th>
                        <th className="whitespace-nowrap pb-2 font-semibold">이전</th>
                        <th className="whitespace-nowrap pb-2 font-semibold">변화</th>
                        <th className="whitespace-nowrap pb-2 font-semibold">지표</th>
                        <th className="whitespace-nowrap pb-2 font-semibold">게시물</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {selectedGroup.rankChanges.slice(0, 12).map((change) => (
                        <tr key={change.url}>
                          <td className="whitespace-nowrap py-2 tabular-nums">{formatNumber(change.observedRank)}</td>
                          <td className="whitespace-nowrap py-2 tabular-nums">{formatNumber(change.previousRank)}</td>
                          <td className="whitespace-nowrap py-2 font-semibold text-accent-ink">
                            {directionLabel(change.direction, change.rankDelta)}
                          </td>
                          <td className="whitespace-nowrap py-2 text-xs leading-5 text-muted">
                            조회 {formatNumber(change.viewCount)}
                            <br />
                            댓글 {formatNumber(change.commentCount)}
                          </td>
                          <td className="py-2">
                            <a
                              href={change.url}
                              target="_blank"
                              rel="noreferrer"
                              className="ig-clamp-2 ig-text-cell text-accent-ink hover:underline"
                            >
                              {shortText(change.caption || change.url, 90)}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-[148px] items-center justify-center rounded-[8px] bg-[#fcfbf8] px-4 text-center text-sm text-muted">
                  같은 키워드의 이전 수집 세션이 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold">수집 항목</h3>
              <span className="text-xs text-muted">{formatNumber(visibleItems.length)}개</span>
            </div>
            <div className="nt-scroll overflow-auto">
              <table className="w-full min-w-[760px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[60px]" />
                  <col className="w-[70px]" />
                  <col className="w-[120px]" />
                  <col className="w-[64px]" />
                  <col className="w-[80px]" />
                  <col className="w-[70px]" />
                  <col className="w-[78px]" />
                  <col />
                </colgroup>
                <thead className="bg-[#fcfbf8] text-left text-xs text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">순위</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">영역</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">소스</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">유형</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">조회수</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">댓글</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">좋아요</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">링크</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length ? (
                    visibleItems.map((item) => (
                      <Fragment key={`${item.runId}-${item.url}`}>
                        <tr className="border-t border-line-soft hover:bg-[#fcfbf6]">
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 align-top font-semibold tabular-nums">
                            #{formatNumber(item.observedRank)}
                          </td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 align-top text-muted">{bucketLabel(item.rankBucket)}</td>
                          <td className="px-4 pb-1 pt-3 align-top">
                            <span
                              title={item.sourceMode === "hashtag" ? `#${item.sourceTerm}` : item.sourceTerm}
                              className="block truncate whitespace-nowrap"
                            >
                              {item.sourceMode === "hashtag" ? `#${item.sourceTerm}` : item.sourceTerm}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 align-top text-muted">{item.type ?? "-"}</td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 text-right align-top tabular-nums">
                            {formatNumber(item.viewCount)}
                          </td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 text-right align-top tabular-nums">
                            {formatNumber(item.commentCount)}
                          </td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 text-right align-top tabular-nums">
                            {formatNumber(item.likeCount)}
                          </td>
                          <td className="whitespace-nowrap px-4 pb-1 pt-3 align-top">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent-ink hover:underline"
                            >
                              열기
                            </a>
                          </td>
                        </tr>
                        <tr className="border-b border-line-soft">
                          <td colSpan={8} className="px-4 pb-3 pt-1 text-muted">
                            <p
                              title={item.caption || item.previewText || item.error || ""}
                              className="ig-text-cell whitespace-normal rounded-[8px] bg-[#fbfaf7] px-3 py-2.5 leading-6"
                            >
                              {shortText(item.caption || item.previewText || item.error, 220)}
                            </p>
                          </td>
                        </tr>
                      </Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-muted">
                        수집을 시작하면 결과가 표시됩니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
