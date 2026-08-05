"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Candidate, Category, DiscoverySource, Keyword, Scorecard, WeekPoint } from "./types";
import { seedKeywords } from "./defaults";
import { fetchDataLab, type DataLabResult } from "./datalab";
import { fetchInstagram, fetchYouTube } from "./social";
import { fetchCandidates } from "./discovery";
import { fetchDiscover, SEED_PRESETS, type DiscoverCandidate } from "./global";
import { fetchAutocomplete, type AcCandidate } from "./naver-ac";
import { fetchShopping, type ShoppingTrend } from "./shopping";
import { logDiscovery } from "./discovery-log";
import { discoveryScore, trendFromWeeks } from "./trend";
import { weightFor, applyWeight } from "./signal-weights";
import { fetchSignalWeights } from "./weights-client";
import { fetchWatchlist, saveWatchlist } from "./watchlist-client";
import { fetchState, saveState } from "./app-state-client";

/**
 * 발굴 엔진을 유튜브로 통일했다(국내 발굴과 동일). 유튜브는 order=date 로
 * 신규 업로드를 훑기 때문에 시드에 **의도어(신상·유행·품절)** 가 붙어야 신조어가 잡힌다.
 * 시드가 "디저트"뿐이면 무작위 업로드라 아무것도 안 나온다.
 */
const DEFAULT_SEEDS = [
  "신상 디저트",
  "유행 간식",
  "편의점 신상",
  "품절 대란 간식",
  "요즘 유행 음료",
  "신상 과자",
  "해외 인기 간식",
  "카페 신메뉴",
];
/** 발굴 후 데이터랩·검색량을 조회할 상위 후보 수. */
const TREND_TOP = 24;

/**
 * 해외 발굴 — 미국(US) 하나. 국내와 달리 **검색 검증 소스가 없다**(데이터랩·검색광고·
 * 쇼핑은 전부 한국 전용). 그래서 해외는 유튜브 콘텐츠 **급상승(lift, 채널 확산 배수)**
 * 하나로만 순위를 매긴다. 국내 발굴과 같은 엔진(fetchDiscover)에 지역만 US로 바꾼다.
 */
/** 해외 발굴 리전 — 미국 + 영국(유럽 영어권). 리전마다 시드×쿼터가 든다. */
export const OVERSEAS_REGIONS = ["US", "GB"];
const DEFAULT_OVERSEAS_SEEDS = SEED_PRESETS.en;
/** 해외 급상승 후보 상위 몇 개까지 대시보드에 남길지. */
const OVERSEAS_TOP = 15;

/**
 * 옛 검색광고 발굴 시절의 맨 시드(예: "디저트")를 유튜브 발굴용 의도어 시드로 갈아끼운다.
 * 유튜브는 order=date 라 의도어가 없으면 신조어가 안 잡힌다. 이미 의도어(공백 포함)면
 * 그대로 둔다. 알려진 카테고리는 자연스러운 문구로, 나머지 맨 단어는 "신상 …"을 붙인다.
 */
const SEED_INTENT: Record<string, string> = {
  디저트: "신상 디저트",
  베이커리: "신상 베이커리",
  음료: "요즘 유행 음료",
  스낵: "신상 과자",
  빵: "신상 빵",
  과자: "신상 과자",
  간식: "유행 간식",
};
function migrateSeeds(stored: string[]): string[] {
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_SEEDS;
  // 하나라도 공백(의도어 구조)이 있으면 이미 새 형식으로 보고 그대로 둔다.
  if (stored.some((s) => s.includes(" "))) return stored;
  const out = stored.map((s) => SEED_INTENT[s] ?? (s ? `신상 ${s}` : s)).filter(Boolean);
  return out.length ? out : DEFAULT_SEEDS;
}

const KW_KEY = "td.keywords.v1";
const SC_KEY = "td.scorecards.v1";
const LU_KEY = "td.lastUpdated.v1";
// v2: 대시보드·국내 발굴 시드를 8개 공통 세트로 통일(재시드 위해 키 버전 업).
const SEEDS_KEY = "td.seeds.v2";
const CAND_KEY = "td.candidates.v1";
const LD_KEY = "td.lastDiscovery.v1";
// v4: 조합 테마어까지 빼고 완전 중립 발굴 의도어로 교체하며 버전업.
const OSEEDS_KEY = "td.overseasSeeds.v4";
const OCAND_KEY = "td.overseasCandidates.v1";

export interface RefreshResult {
  ok: number;
  fail: number;
  error?: string;
  /** 발굴 시 해외(US) 후보 개수. undefined = 해외 발굴 미실행/실패. */
  overseas?: number;
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
  runDiscovery: (
    seedsOverride?: string[],
    scope?: "both" | "domestic" | "overseas",
  ) => Promise<RefreshResult>;
  saveCandidate: (candidate: Candidate, category: Category) => void;
  // 해외 발굴(미국) — 콘텐츠 급상승만
  overseasSeeds: string[];
  setOverseasSeeds: (seeds: string[]) => void;
  overseasCandidates: DiscoverCandidate[];
}

const StoreContext = createContext<StoreValue | null>(null);

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  /** watchlist 를 Supabase 에 저장 중인가(설정됨). false 면 localStorage 만. */
  const [watchlistPersisted, setWatchlistPersisted] = useState(false);
  /** 시드(국내·해외)를 Supabase 에 저장 중인가. false 면 localStorage 만. */
  const [seedsPersisted, setSeedsPersisted] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeds, setSeeds] = useState<string[]>(DEFAULT_SEEDS);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [lastDiscoveryAt, setLastDiscoveryAt] = useState<string | null>(null);
  const [overseasSeeds, setOverseasSeeds] = useState<string[]>(DEFAULT_OVERSEAS_SEEDS);
  const [overseasCandidates, setOverseasCandidates] = useState<DiscoverCandidate[]>([]);

  // 최초 마운트 시 로드. watchlist(저장한 후보)는 Supabase 우선, 나머지는 localStorage.
  useEffect(() => {
    (async () => {
      // 1) watchlist 로컬 폴백 값 준비
      let localKeywords: Keyword[];
      try {
        const rawK = localStorage.getItem(KW_KEY);
        localKeywords = rawK ? (JSON.parse(rawK) as Keyword[]) : seedKeywords();
      } catch {
        localKeywords = seedKeywords();
      }

      // 2) watchlist — Supabase 우선. 설정돼 있으면 서버 값을(비어 있으면 로컬을 올려 마이그레이션).
      try {
        const remote = await fetchWatchlist();
        if (remote.persisted) {
          setWatchlistPersisted(true);
          setKeywords(remote.keywords && remote.keywords.length ? remote.keywords : localKeywords);
        } else {
          setKeywords(localKeywords);
        }
      } catch {
        setKeywords(localKeywords);
      }

      // 3) 나머지 상태는 기존대로 localStorage
      try {
        const rawS = localStorage.getItem(SC_KEY);
        const rawL = localStorage.getItem(LU_KEY);
        if (rawS) setScorecards(JSON.parse(rawS) as Scorecard[]);
        setLastUpdated(rawL ?? nowIso());
        // 시드(국내·해외) — Supabase 우선, 폴백 localStorage. (비어 있으면 로컬을 올려 마이그레이션)
        const rawSeeds = localStorage.getItem(SEEDS_KEY);
        const rawOSeeds = localStorage.getItem(OSEEDS_KEY);
        const localSeeds = rawSeeds ? migrateSeeds(JSON.parse(rawSeeds) as string[]) : null;
        const localOSeeds = rawOSeeds ? (JSON.parse(rawOSeeds) as string[]) : null;
        try {
          const [rs, ros] = await Promise.all([
            fetchState<string[]>("seeds"),
            fetchState<string[]>("overseas_seeds"),
          ]);
          if (rs.persisted || ros.persisted) setSeedsPersisted(true);
          if (rs.persisted && rs.data && rs.data.length) setSeeds(migrateSeeds(rs.data));
          else if (localSeeds) setSeeds(localSeeds);
          if (ros.persisted && ros.data && ros.data.length) setOverseasSeeds(ros.data);
          else if (localOSeeds) setOverseasSeeds(localOSeeds);
        } catch {
          if (localSeeds) setSeeds(localSeeds);
          if (localOSeeds) setOverseasSeeds(localOSeeds);
        }

        // candidates / 마지막 발굴시각 — localStorage 유지(발굴 결과 캐시).
        const rawCand = localStorage.getItem(CAND_KEY);
        const rawLd = localStorage.getItem(LD_KEY);
        if (rawCand) setCandidates(JSON.parse(rawCand) as Candidate[]);
        if (rawLd) setLastDiscoveryAt(rawLd);
        const rawOCand = localStorage.getItem(OCAND_KEY);
        if (rawOCand) setOverseasCandidates(JSON.parse(rawOCand) as DiscoverCandidate[]);
      } catch {
        setLastUpdated(nowIso());
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // 변경 시 localStorage(오프라인 캐시) + Supabase(영속, 디바운스)에 반영.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KW_KEY, JSON.stringify(keywords));
    if (!watchlistPersisted) return;
    // enrich 업데이트로 잦게 바뀌므로 800ms 디바운스 — 마지막 상태만 저장.
    const timer = setTimeout(() => {
      void saveWatchlist(keywords);
    }, 800);
    return () => clearTimeout(timer);
  }, [keywords, hydrated, watchlistPersisted]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(SC_KEY, JSON.stringify(scorecards));
  }, [scorecards, hydrated]);
  useEffect(() => {
    if (hydrated && lastUpdated) localStorage.setItem(LU_KEY, lastUpdated);
  }, [lastUpdated, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SEEDS_KEY, JSON.stringify(seeds));
    if (!seedsPersisted) return;
    const t = setTimeout(() => void saveState("seeds", seeds), 800);
    return () => clearTimeout(t);
  }, [seeds, hydrated, seedsPersisted]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(CAND_KEY, JSON.stringify(candidates));
  }, [candidates, hydrated]);
  useEffect(() => {
    if (hydrated && lastDiscoveryAt) localStorage.setItem(LD_KEY, lastDiscoveryAt);
  }, [lastDiscoveryAt, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(OSEEDS_KEY, JSON.stringify(overseasSeeds));
    if (!seedsPersisted) return;
    const t = setTimeout(() => void saveState("overseas_seeds", overseasSeeds), 800);
    return () => clearTimeout(t);
  }, [overseasSeeds, hydrated, seedsPersisted]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(OCAND_KEY, JSON.stringify(overseasCandidates));
  }, [overseasCandidates, hydrated]);

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

  const runDiscovery = useCallback(async (seedsOverride?: string[], scope: "both" | "domestic" | "overseas" = "both"): Promise<RefreshResult> => {
    const doKR = scope !== "overseas"; // 국내 발굴 (홈·국내탭)
    const doOS = scope !== "domestic"; // 해외 발굴 (홈만 — 국내탭은 국내만)
    // 국내 발굴 탭에서 시드를 넘기면 그걸 쓰고 store 시드도 그 값으로 통일한다(대시보드와 공유).
    const useSeeds = seedsOverride?.length ? seedsOverride : seeds;
    if (doKR && !useSeeds.length) {
      return { ok: 0, fail: 0, error: "시드 키워드를 입력하세요." };
    }
    if (scope === "overseas" && !overseasSeeds.length) {
      return { ok: 0, fail: 0, error: "해외 시드를 입력하세요." };
    }
    if (seedsOverride?.length) setSeeds(seedsOverride);
    setDiscovering(true);
    try {
      // 범위에 맞춰 유튜브 콘텐츠 발굴을 병렬로 — 홈=국내(KR)+해외(US·GB), 국내탭=국내만.
      const tasks: Array<ReturnType<typeof fetchDiscover>> = [];
      if (doKR) tasks.push(fetchDiscover(useSeeds, "KR"));
      if (doOS) for (const r of OVERSEAS_REGIONS) tasks.push(fetchDiscover(overseasSeeds, r));
      const settled = await Promise.allSettled(tasks);
      const krSettled = doKR ? settled[0] : null;
      const osSettledList = doKR ? settled.slice(1) : settled;

      // ④ 해외 결과 반영 — 리전별 후보를 합쳐(같은 용어면 lift 큰 쪽) 순위 재계산. 실패 시 직전 유지.
      let overseas: number | undefined;
      if (doOS && osSettledList.some((s) => s.status === "fulfilled")) {
        const osNorm = (s: string) =>
          s.replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase();
        const osMap = new Map<string, DiscoverCandidate>();
        for (const s of osSettledList) {
          if (s.status !== "fulfilled") continue;
          for (const c of s.value.candidates) {
            const k = osNorm(c.term);
            const ex = osMap.get(k);
            if (!ex || (c.lift ?? 0) > (ex.lift ?? 0)) osMap.set(k, c);
          }
        }
        const merged = [...osMap.values()].sort(
          (a, b) => (b.lift ?? 0) - (a.lift ?? 0) || (b.dfRecent ?? 0) - (a.dfRecent ?? 0),
        );
        // 병합 후 점수는 합쳐진 집합의 최대 lift 기준으로 다시 매긴다(리전별 정규화 불일치 방지).
        const maxLift = Math.max(1, ...merged.map((c) => c.lift ?? 0));
        const top = merged
          .slice(0, OVERSEAS_TOP)
          .map((c) => ({ ...c, score: Math.round(((c.lift ?? 0) / maxLift) * 100) }));
        setOverseasCandidates(top);
        overseas = top.length;
      }

      // 해외 전용(scope)이면 국내 처리 없이 종료.
      if (!doKR) return { ok: 0, fail: 0, overseas };

      // ① 유튜브 콘텐츠 신조어(단일 토큰).
      const disc = krSettled?.status === "fulfilled" ? krSettled.value : null;
      const yt = disc
        ? disc.candidates
            .filter((c) => !c.term.includes(" "))
            .slice(0, 16)
            .map((c) => ({
              term: c.term.replace(/^#/, ""),
              lift: c.lift,
              dfRecent: c.dfRecent,
              novel: c.novel,
              contextTag: c.contextTag,
            }))
        : [];

      // 자동완성 시드 = 유튜브가 발굴한 키워드. 유튜브가 못 잡으면 자동완성도 안 돈다.
      let acCands: AcCandidate[] = [];
      if (yt.length) {
        try {
          acCands = (await fetchAutocomplete(yt.map((c) => c.term))).candidates.slice(0, 12);
        } catch {
          // 자동완성 실패해도 유튜브 후보로 진행
        }
      }

      // 유튜브 발굴이 비면(쿼터 등) 자동완성도 시드가 없어 국내 후보 없음 — 종료(해외만 반영).
      // ⚠️ 실패 시엔 기존 후보·마지막 발굴 시각을 건드리지 않는다 — 최종 성공 결과를 그대로 유지.
      if (!yt.length) {
        return {
          ok: 0,
          fail: 0,
          overseas,
          error:
            krSettled?.status === "rejected"
              ? krSettled.reason instanceof Error
                ? krSettled.reason.message
                : "국내 발굴에 실패했습니다."
              : undefined,
        };
      }

      // 두 소스 후보 병합 · 중복 제거. 같은 단어면 source="both".
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      const cmap = new Map<
        string,
        {
          term: string;
          source: DiscoverySource;
          lift?: number;
          dfRecent?: number;
          novel: boolean;
          contextTag?: "food" | "neutral" | "nonfood";
        }
      >();
      for (const c of yt)
        cmap.set(norm(c.term), {
          term: c.term,
          source: "youtube",
          lift: c.lift,
          dfRecent: c.dfRecent,
          novel: c.novel,
          contextTag: c.contextTag,
        });
      for (const a of acCands) {
        const k = norm(a.term);
        const ex = cmap.get(k);
        if (ex) ex.source = "both";
        else cmap.set(k, { term: a.term, source: "search", novel: false });
      }
      const cands = [...cmap.values()].slice(0, TREND_TOP);
      const terms = cands.map((c) => c.term);

      // ② 네이버 데이터랩으로 검색 급상승 검증.
      //    창을 6개월로 넓혀야 레벨 게이트가 "자기 이력 바닥 꿈틀거림"을 걸러낼 수 있다.
      const weeksByName: Record<string, WeekPoint[]> = {};
      const lookbackStart = new Date();
      lookbackStart.setMonth(lookbackStart.getMonth() - 6);
      try {
        const results = await fetchDataLab(terms, { startDate: lookbackStart.toISOString().slice(0, 10) });
        for (const r of results) {
          weeksByName[r.title] = r.data.map((d) => ({ period: d.period, ratio: d.ratio }));
        }
      } catch {
        // 트렌드 조회가 실패해도 발굴 결과는 유지한다.
      }

      // ③ (보조) 검색광고로 월 검색량 보강 — 신조어는 값이 없을 수 있어 best-effort.
      const volByName: Record<string, { volumePc: number; volumeMobile: number; volumeTotal: number; compIdx?: string }> = {};
      try {
        for (const r of await fetchCandidates(terms)) volByName[r.name] = r;
      } catch {
        // 검색광고 실패해도 발굴/검증은 유지한다.
      }

      // ④ (보조) 쇼핑 구매의향 — 유지·하락 포함 모든 후보를 조회한다. 국내 발굴 탭 공유용.
      //    (상승 후보만 보면 "검색은 죽었는데 구매만 살아 있는" 반대 신호를 놓친다.)
      //    실패해도 넘어간다.
      const shopByName = new Map<string, ShoppingTrend>();
      try {
        const shopTargets = cands.map((c) => c.term);
        if (shopTargets.length) {
          const shop = await fetchShopping(shopTargets);
          for (const [k, v] of shop) shopByName.set(k, v);
        }
      } catch {
        // 쇼핑 실패해도 발굴/검증은 유지한다.
      }

      const maxVol = Math.max(1, ...terms.map((t) => volByName[t]?.volumeTotal ?? 0));
      // 3단계 — 학습된 신호 가중치를 발굴 점수에 반영. 데이터 없으면 중립(×1.0)이라 무영향.
      const weights = await fetchSignalWeights();
      const scored: Candidate[] = cands
        .map((c) => {
          const weeks = weeksByName[c.term] ?? [];
          const t = trendFromWeeks(weeks);
          const v = volByName[c.term];
          // 발굴점수 = 검색 상승(riseRate) 중심. 신조어는 검색량 0이어도 리스트에 남는다.
          const base = discoveryScore(v?.volumeTotal ?? 0, maxVol, t.riseRate, t.pattern, t.streak);
          const mult = weightFor(weights, { source: c.source, novel: c.novel });
          return {
            name: c.term,
            source: c.source,
            lift: c.lift,
            dfRecent: c.dfRecent,
            novel: c.novel,
            contextTag: c.contextTag,
            shop: shopByName.get(c.term),
            volumePc: v?.volumePc ?? 0,
            volumeMobile: v?.volumeMobile ?? 0,
            volumeTotal: v?.volumeTotal ?? 0,
            compIdx: v?.compIdx,
            weeks,
            riseRate: t.riseRate,
            // 학습된 신호 신뢰도(출처·신규여부 오탐률)를 배수로 반영.
            score: applyWeight(base, mult),
          };
        })
        .sort((a, b) => b.score - a.score);
      setCandidates(scored);

      // 전향적 발굴 로그 — 최초 등장 후보를 출처·초기신호와 함께 서버에 남긴다(fire-and-forget).
      void logDiscovery(
        scored.map((c) => ({
          term: c.name,
          source: c.source,
          novel: c.novel,
          lift: c.lift,
          dfRecent: c.dfRecent,
          contextTag: c.contextTag,
          riseRate: c.riseRate,
          volumeTotal: c.volumeTotal,
          shopStatus: c.shop?.status,
          shopRise: c.shop?.riseRate ?? null,
        })),
      );
      setLastDiscoveryAt(nowIso());
      return { ok: scored.length, fail: disc?.ytError ? 1 : 0, error: disc?.ytError, overseas };
    } catch (e) {
      return {
        ok: 0,
        fail: 0,
        error: e instanceof Error ? e.message : "발굴에 실패했습니다.",
      };
    } finally {
      setDiscovering(false);
    }
  }, [seeds, overseasSeeds]);

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
      overseasSeeds,
      setOverseasSeeds,
      overseasCandidates,
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
      overseasSeeds,
      overseasCandidates,
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
