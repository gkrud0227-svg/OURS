"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Candidate, Category, Keyword, Scorecard, WeekPoint } from "./types";
import { seedKeywords } from "./defaults";
import { fetchDataLab, type DataLabResult } from "./datalab";
import { fetchInstagram, fetchYouTube } from "./social";
import { fetchCandidates } from "./discovery";
import { discoveryScore, trendFromWeeks } from "./trend";

const DEFAULT_SEEDS = ["디저트", "베이커리", "음료", "스낵"];
/** 발굴 후 데이터랩 트렌드를 조회할 상위 후보 수(검색량 기준). */
const TREND_TOP = 24;

const KW_KEY = "td.keywords.v1";
const SC_KEY = "td.scorecards.v1";
const LU_KEY = "td.lastUpdated.v1";
const SEEDS_KEY = "td.seeds.v1";
const CAND_KEY = "td.candidates.v1";
const LD_KEY = "td.lastDiscovery.v1";

export interface RefreshResult {
  ok: number;
  fail: number;
  error?: string;
}

interface StoreValue {
  hydrated: boolean;
  keywords: Keyword[];
  scorecards: Scorecard[];
  lastUpdated: string | null;
  refreshing: boolean;
  addKeyword: (name: string, category: Category) => boolean;
  deleteKeyword: (id: string) => void;
  updateKeyword: (id: string, patch: Partial<Keyword>) => void;
  setTiktok: (id: string, value: number | null) => void;
  addScorecard: (input: Omit<Scorecard, "id" | "createdAt">) => void;
  deleteScorecard: (id: string) => void;
  refreshAll: () => Promise<RefreshResult>;
  refreshOne: (id: string) => Promise<RefreshResult>;
  refreshYouTube: (id?: string) => Promise<RefreshResult>;
  refreshInstagram: (id?: string) => Promise<RefreshResult>;
  // 발굴(discovery)
  seeds: string[];
  setSeeds: (seeds: string[]) => void;
  candidates: Candidate[];
  discovering: boolean;
  lastDiscoveryAt: string | null;
  runDiscovery: () => Promise<RefreshResult>;
  saveCandidate: (candidate: Candidate, category: Category) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeds, setSeeds] = useState<string[]>(DEFAULT_SEEDS);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [lastDiscoveryAt, setLastDiscoveryAt] = useState<string | null>(null);

  // 최초 마운트 시 localStorage에서 로드하거나 기본값을 시드한다.
  useEffect(() => {
    try {
      const rawK = localStorage.getItem(KW_KEY);
      const rawS = localStorage.getItem(SC_KEY);
      const rawL = localStorage.getItem(LU_KEY);
      if (rawK) {
        setKeywords(JSON.parse(rawK) as Keyword[]);
      } else {
        setKeywords(seedKeywords());
      }
      if (rawS) setScorecards(JSON.parse(rawS) as Scorecard[]);
      setLastUpdated(rawL ?? nowIso());
      const rawSeeds = localStorage.getItem(SEEDS_KEY);
      const rawCand = localStorage.getItem(CAND_KEY);
      const rawLd = localStorage.getItem(LD_KEY);
      if (rawSeeds) setSeeds(JSON.parse(rawSeeds) as string[]);
      if (rawCand) setCandidates(JSON.parse(rawCand) as Candidate[]);
      if (rawLd) setLastDiscoveryAt(rawLd);
    } catch {
      setKeywords(seedKeywords());
      setLastUpdated(nowIso());
    } finally {
      setHydrated(true);
    }
  }, []);

  // 변경 시 localStorage에 반영 (하이드레이션 이후에만).
  useEffect(() => {
    if (hydrated) localStorage.setItem(KW_KEY, JSON.stringify(keywords));
  }, [keywords, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(SC_KEY, JSON.stringify(scorecards));
  }, [scorecards, hydrated]);
  useEffect(() => {
    if (hydrated && lastUpdated) localStorage.setItem(LU_KEY, lastUpdated);
  }, [lastUpdated, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(SEEDS_KEY, JSON.stringify(seeds));
  }, [seeds, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(CAND_KEY, JSON.stringify(candidates));
  }, [candidates, hydrated]);
  useEffect(() => {
    if (hydrated && lastDiscoveryAt) localStorage.setItem(LD_KEY, lastDiscoveryAt);
  }, [lastDiscoveryAt, hydrated]);

  const addKeyword = useCallback(
    (name: string, category: Category) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (keywords.some((k) => k.name === trimmed)) return false;
      setKeywords((prev) =>
        prev.some((k) => k.name === trimmed)
          ? prev
          : [
              ...prev,
              {
                id: crypto.randomUUID(),
                name: trimmed,
                category,
                weeks: [],
                tiktok: null,
                source: undefined,
                updatedAt: null,
              },
            ],
      );
      return true;
    },
    [keywords],
  );

  const deleteKeyword = useCallback((id: string) => {
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }, []);

  const updateKeyword = useCallback((id: string, patch: Partial<Keyword>) => {
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, ...patch } : k)),
    );
  }, []);

  const setTiktok = useCallback((id: string, value: number | null) => {
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, tiktok: value } : k)),
    );
  }, []);

  const addScorecard = useCallback(
    (input: Omit<Scorecard, "id" | "createdAt">) => {
      setScorecards((prev) => [
        { id: crypto.randomUUID(), createdAt: nowIso(), ...input },
        ...prev,
      ]);
    },
    [],
  );

  const deleteScorecard = useCallback((id: string) => {
    setScorecards((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applyResults = useCallback((results: DataLabResult[]) => {
    const ts = nowIso();
    setKeywords((prev) =>
      prev.map((k) => {
        const r = results.find((x) => x.title === k.name);
        if (!r || !r.data.length) return k;
        return {
          ...k,
          weeks: r.data.map((d) => ({ period: d.period, ratio: d.ratio })),
          source: "datalab" as const,
          updatedAt: ts,
        };
      }),
    );
    setLastUpdated(ts);
  }, []);

  const refreshAll = useCallback(async (): Promise<RefreshResult> => {
    const names = keywords.map((k) => k.name);
    if (!names.length) return { ok: 0, fail: 0 };
    setRefreshing(true);
    try {
      const results = await fetchDataLab(names);
      applyResults(results);
      return { ok: results.length, fail: Math.max(0, names.length - results.length) };
    } catch (e) {
      return {
        ok: 0,
        fail: names.length,
        error: e instanceof Error ? e.message : "요청에 실패했습니다.",
      };
    } finally {
      setRefreshing(false);
    }
  }, [keywords, applyResults]);

  const refreshOne = useCallback(
    async (id: string): Promise<RefreshResult> => {
      const kw = keywords.find((k) => k.id === id);
      if (!kw) return { ok: 0, fail: 0, error: "키워드를 찾을 수 없습니다." };
      setRefreshing(true);
      try {
        const results = await fetchDataLab([kw.name]);
        applyResults(results);
        return { ok: results.length, fail: results.length ? 0 : 1 };
      } catch (e) {
        return {
          ok: 0,
          fail: 1,
          error: e instanceof Error ? e.message : "요청에 실패했습니다.",
        };
      } finally {
        setRefreshing(false);
      }
    },
    [keywords, applyResults],
  );

  const refreshYouTube = useCallback(
    async (id?: string): Promise<RefreshResult> => {
      const targets = id ? keywords.filter((k) => k.id === id) : keywords;
      const names = targets.map((k) => k.name);
      if (!names.length) return { ok: 0, fail: 0 };
      setRefreshing(true);
      try {
        const stats = await fetchYouTube(names);
        setKeywords((prev) =>
          prev.map((k) =>
            stats[k.name] ? { ...k, youtube: stats[k.name] } : k,
          ),
        );
        const ok = Object.keys(stats).length;
        return { ok, fail: Math.max(0, names.length - ok) };
      } catch (e) {
        return {
          ok: 0,
          fail: names.length,
          error: e instanceof Error ? e.message : "요청에 실패했습니다.",
        };
      } finally {
        setRefreshing(false);
      }
    },
    [keywords],
  );

  const refreshInstagram = useCallback(
    async (id?: string): Promise<RefreshResult> => {
      const targets = id ? keywords.filter((k) => k.id === id) : keywords;
      const names = targets.map((k) => k.name);
      if (!names.length) return { ok: 0, fail: 0 };
      setRefreshing(true);
      try {
        const stats = await fetchInstagram(names);
        setKeywords((prev) =>
          prev.map((k) =>
            stats[k.name] ? { ...k, instagram: stats[k.name] } : k,
          ),
        );
        const ok = Object.keys(stats).length;
        return { ok, fail: Math.max(0, names.length - ok) };
      } catch (e) {
        return {
          ok: 0,
          fail: names.length,
          error: e instanceof Error ? e.message : "요청에 실패했습니다.",
        };
      } finally {
        setRefreshing(false);
      }
    },
    [keywords],
  );

  const runDiscovery = useCallback(async (): Promise<RefreshResult> => {
    if (!seeds.length) {
      return { ok: 0, fail: 0, error: "시드 키워드를 입력하세요." };
    }
    setDiscovering(true);
    try {
      const raw = await fetchCandidates(seeds);
      if (!raw.length) {
        setCandidates([]);
        setLastDiscoveryAt(nowIso());
        return { ok: 0, fail: 0 };
      }
      const top = raw.slice(0, TREND_TOP);
      const weeksByName: Record<string, WeekPoint[]> = {};
      try {
        const results = await fetchDataLab(top.map((c) => c.name));
        for (const r of results) {
          weeksByName[r.title] = r.data.map((d) => ({
            period: d.period,
            ratio: d.ratio,
          }));
        }
      } catch {
        // 트렌드 조회가 실패해도 검색량 랭킹은 유지한다.
      }
      const maxVol = Math.max(1, ...top.map((c) => c.volumeTotal));
      const scored: Candidate[] = top
        .map((c) => {
          const weeks = weeksByName[c.name] ?? [];
          const t = trendFromWeeks(weeks);
          return {
            ...c,
            weeks,
            riseRate: t.riseRate,
            score: discoveryScore(c.volumeTotal / maxVol, t.riseRate),
          };
        })
        .sort((a, b) => b.score - a.score);
      setCandidates(scored);
      setLastDiscoveryAt(nowIso());
      return { ok: scored.length, fail: 0 };
    } catch (e) {
      return {
        ok: 0,
        fail: 0,
        error: e instanceof Error ? e.message : "발굴에 실패했습니다.",
      };
    } finally {
      setDiscovering(false);
    }
  }, [seeds]);

  const saveCandidate = useCallback(
    (candidate: Candidate, category: Category) => {
      setKeywords((prev) => {
        if (prev.some((k) => k.name === candidate.name)) return prev;
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: candidate.name,
            category,
            weeks: candidate.weeks,
            tiktok: null,
            source: candidate.weeks.length ? ("datalab" as const) : undefined,
            updatedAt: candidate.weeks.length ? nowIso() : null,
            volumeTotal: candidate.volumeTotal,
          },
        ];
      });
    },
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      hydrated,
      keywords,
      scorecards,
      lastUpdated,
      refreshing,
      addKeyword,
      deleteKeyword,
      updateKeyword,
      setTiktok,
      addScorecard,
      deleteScorecard,
      refreshAll,
      refreshOne,
      refreshYouTube,
      refreshInstagram,
      seeds,
      setSeeds,
      candidates,
      discovering,
      lastDiscoveryAt,
      runDiscovery,
      saveCandidate,
    }),
    [
      hydrated,
      keywords,
      scorecards,
      lastUpdated,
      refreshing,
      addKeyword,
      deleteKeyword,
      updateKeyword,
      setTiktok,
      addScorecard,
      deleteScorecard,
      refreshAll,
      refreshOne,
      refreshYouTube,
      refreshInstagram,
      seeds,
      candidates,
      discovering,
      lastDiscoveryAt,
      runDiscovery,
      saveCandidate,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
