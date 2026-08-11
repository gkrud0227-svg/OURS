import { NextResponse } from "next/server";
import { docTerms, seedTokenSet } from "@/lib/cooccurrence";
import { localeForRegion, localePredicate } from "@/lib/lang";
import { contextOf, contextTagOf, CONTEXT_RANK } from "@/lib/food-context";
import { analyzeReasons, type ReasonLocale } from "@/lib/reasons";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** search.list는 요청당 100 units, videos.list는 1 unit. */
const SEARCH_UNITS = 100;
const VIDEOS_UNITS = 1;
/** 시드 수 상한. 시드 1개당 약 500 units(최근 2p + 기준선 3p) — 8개면 회당 약 4,000.
 *  기준선은 12시간 캐시되므로 반복 실행 비용은 이보다 훨씬 낮다. */
const MAX_SEEDS = 8;

/** 코퍼스당 검색 페이지 수 (1페이지 = 영상 50건). */
const RECENT_PAGES = 2;
/** 기준선은 넓을수록 좋다. 흔한 말이 기준선에 확실히 잡혀야 lift가 변별력을 갖는다.
 *  12시간 캐시되므로 비용은 첫 실행에만 든다. */
const BASELINE_PAGES = 3;

/**
 * 검색 정렬 — 발굴의 성패를 가른다.
 *
 * `order=viewCount`는 조회수 수천만짜리 **에버그린 레시피 모음집**을 끌어온다.
 * `order=date`는 지금 막 올라온 영상을 준다. 실측(US · 최근 14일 · 50건):
 *
 *   q="dessert"       order=viewCount  → 트렌드어  2건
 *   q="dessert"       order=date       → 트렌드어  0건
 *   q="viral dessert" order=date       → 트렌드어 11건  (dubai 5 · pistachio 3 · knafeh 1)
 *
 * 즉 **`order=date` + 시드의 의도어(viral/trending/new)** 조합이어야 한다.
 * 시드가 `dessert`뿐이면 신규 업로드가 무작위라 아무것도 안 잡힌다.
 */
const ORDER = "date";

/**
 * 최근 코퍼스에서 이 **채널 수** 미만으로 등장하는 용어는 버린다.
 *
 * ⚠️ 영상 수로 세면 안 된다. 한 채널이 영상 10개에 같은 설명문을 복붙하면
 *    (`these creative ideas look super satisfying`) "10개 영상에서 등장"으로
 *    보인다. 진짜 트렌드는 **여러 채널로 번진다.**
 *
 * 신조어는 희소하므로(knafeh 1건) 2로 둔다. 3이면 갓 태어난 트렌드가 잘린다.
 */
const MIN_RECENT_CHANNELS = 2;
/** 표본이 작을 때 lift가 폭주하는 것을 막는다. */
const MAX_LIFT = 40;
/**
 * add-k 스무딩의 k. 기준선 표본은 유한하므로 0건이 곧 부재는 아니다.
 */
const SMOOTHING_K = 2;

/**
 * ⚠️ 조회수로 가중하지 않는다. 실측 결과 **역효과**였다.
 *
 * 최근 14일 US "viral dessert" 50건에서 속도(조회수/일) 상위는
 * "5 Amazing Dessert Plating Hacks"(90만/일) 같은 일반 클릭베이트였고,
 * 트렌드어를 담은 영상들의 속도는 1,022~1,276/일로 전부 중앙값 근처였다.
 * 속도 5,000 이상만 남기면 트렌드어는 **0건**이 된다.
 *
 * 신조어의 강점은 조회수가 아니라 "기준선엔 없는데 여러 채널이 동시에
 * 말하기 시작함"뿐이다. 그래서 점수는 lift 단독, 동점은 채널 수로 가른다.
 * (조회수는 화면 참고용으로만 함께 내려준다)
 */

const REGION_LANG: Record<string, string> = {
  US: "en",
  GB: "en",
  KR: "ko",
  JP: "ja",
  FR: "fr",
  DE: "de",
  CN: "zh-Hans",
};

interface Doc {
  /** 영상 ID — 시드 간 같은 영상 중복 집계를 막는 데 쓴다. */
  id: string;
  /**
   * 후보 용어는 **제목 + 설명란 앞부분**에서 뽑는다.
   *
   * 설명란 전체를 색인하면 상위가 `tags` · `keywords` · `disclaimer` 로 뒤덮이므로
   * 두 겹으로 막는다. (1) 설명란은 앞부분(본문)만 쓰고 하단 태그·링크·고지 더미는
   * 자른다. (2) 순위는 급증 배수(lift)로 매겨, 설명란에도 흔한 일반어는 기준선에서도
   * 흔해 lift≈1 로 자동으로 밀려난다. 제목만 쓰면 표본이 작아 후보가 빈약해지는 문제를
   * 이렇게 보완한다.
   */
  title: string;
  /** 설명란 원문 — 후보 추출은 앞부분만, 언어 판별엔 전체를 쓴다. */
  desc: string;
  /** 언어 판별용 — 제목만으론 너무 짧다. */
  text: string;
  views: number;
  channelId: string;
  /** 채널 제목 — 창작자가 제목에 자기 채널명을 넣어 생기는 노이즈를 거르는 데 쓴다. */
  channelTitle: string;
}

interface SearchItem {
  id?: { videoId?: string };
}
interface VideoItem {
  id?: string;
  snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string };
  statistics?: { viewCount?: string };
}

/**
 * 기준선은 "3~12개월 전"이라 하루 단위로 거의 변하지 않는다.
 * 프로세스 메모리에 캐시해 발굴을 반복해도 쿼터를 다시 쓰지 않게 한다.
 */
const BASELINE_TTL_MS = 12 * 60 * 60 * 1000;
const baselineCache = new Map<string, { at: number; docs: Doc[] }>();

async function searchPage(
  key: string,
  q: string,
  region: string,
  publishedAfter: string,
  publishedBefore: string | undefined,
  pageToken: string | undefined,
): Promise<{ ids: string[]; next?: string }> {
  const sp = new URLSearchParams({
    key,
    part: "snippet",
    type: "video",
    order: ORDER,
    maxResults: "50",
    regionCode: region,
    relevanceLanguage: REGION_LANG[region] ?? "en",
    publishedAfter,
    q,
  });
  if (publishedBefore) sp.set("publishedBefore", publishedBefore);
  if (pageToken) sp.set("pageToken", pageToken);

  const res = await fetch(`${SEARCH_URL}?${sp}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const json = (await res.json()) as { items?: SearchItem[]; nextPageToken?: string };
  return {
    ids: (json.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => Boolean(v)),
    next: json.nextPageToken,
  };
}

async function hydrate(key: string, ids: string[]): Promise<Doc[]> {
  if (!ids.length) return [];
  // 검색 스니펫의 description은 잘려 있어 videos.list로 전문을 받는다 (1 unit).
  const vp = new URLSearchParams({
    key,
    part: "snippet,statistics",
    id: ids.join(","),
    maxResults: "50",
  });
  const res = await fetch(`${VIDEOS_URL}?${vp}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`videos ${res.status}`);
  const json = (await res.json()) as { items?: VideoItem[] };
  return (json.items ?? []).map((v) => ({
    id: v.id ?? "",
    title: v.snippet?.title ?? "",
    desc: v.snippet?.description ?? "",
    text: `${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`,
    views: Number(v.statistics?.viewCount ?? 0),
    channelId: v.snippet?.channelId ?? v.id ?? "",
    channelTitle: v.snippet?.channelTitle ?? "",
  }));
}

/** 페이지를 이어 받아 코퍼스를 만든다. 반환값에 실제 사용 쿼터를 포함한다. */
async function fetchCorpus(
  key: string,
  q: string,
  region: string,
  publishedAfter: string,
  publishedBefore: string | undefined,
  pages: number,
): Promise<{ docs: Doc[]; units: number }> {
  const docs: Doc[] = [];
  let token: string | undefined;
  let units = 0;

  for (let p = 0; p < pages; p += 1) {
    const { ids, next } = await searchPage(key, q, region, publishedAfter, publishedBefore, token);
    units += SEARCH_UNITS;
    if (!ids.length) break;
    docs.push(...(await hydrate(key, ids)));
    units += VIDEOS_UNITS;
    if (!next) break;
    token = next;
  }
  return { docs, units };
}

async function fetchBaseline(
  key: string,
  seed: string,
  region: string,
  after: string,
  before: string,
): Promise<{ docs: Doc[]; units: number }> {
  // 창(after~before)이 캐시 키에 반드시 들어가야 한다. 백테스트는 기준 시점(asOf)마다
  // 기준선 창이 달라지는데, 키가 지역·시드뿐이면 다른 시점의 코퍼스를 잘못 재사용한다.
  const cacheKey = `${region}::${seed}::${after}::${before}`;
  const hit = baselineCache.get(cacheKey);
  if (hit && Date.now() - hit.at < BASELINE_TTL_MS) {
    return { docs: hit.docs, units: 0 };
  }
  const fresh = await fetchCorpus(key, seed, region, after, before, BASELINE_PAGES);
  baselineCache.set(cacheKey, { at: Date.now(), docs: fresh.docs });
  return fresh;
}

/** 표본이 붕괴하지 않는 선에서만 언어 필터를 적용한다. */
function filterByLocale(docs: Doc[], keep: (t: string) => boolean): Doc[] {
  const kept = docs.filter((d) => keep(d.text));
  return kept.length >= 5 ? kept : docs;
}

/**
 * 용어 → (채널 → 그 채널 최고 조회수).
 * 채널 단위로 접어야 한 채널의 대량 업로드가 통계를 지배하지 못한다.
 */
type ChannelIndex = Map<string, Map<string, number>>;
/** 용어 → 그 용어를 제목에 담은 영상들 (예시 표시용). */
type ExampleIndex = Map<string, { title: string; views: number }[]>;
/** 용어 → 그 용어가 등장한 제목들의 식품/비식품 맥락 집계. */
type ContextIndex = Map<string, { food: number; nonfood: number; total: number }>;

/** 설명란은 앞부분만 후보 추출에 쓴다 — 본문은 위쪽, 태그·링크·고지 더미는 아래쪽에 쌓인다. */
const DESC_TERM_CHARS = 200;

function indexTerms(
  docs: Doc[],
  seedTokens: Set<string>,
  examples?: ExampleIndex,
  context?: ContextIndex,
): ChannelIndex {
  const index: ChannelIndex = new Map();
  for (const doc of docs) {
    // 제목 + 설명란 앞부분에서 후보를 뽑는다. 구분자 " . " 로 제목·설명 경계를 끊어
    // 두 영역이 하나의 bigram 으로 뭉치지 않게 한다. 설명란 하단(태그·링크·고지)은 자른다.
    const source = `${doc.title} . ${(doc.desc ?? "").slice(0, DESC_TERM_CHARS)}`;
    const cx = context ? contextOf(source) : null;
    for (const term of docTerms(source, seedTokens, { hashtags: true })) {
      let channels = index.get(term);
      if (!channels) index.set(term, (channels = new Map()));
      const prev = channels.get(doc.channelId) ?? 0;
      if (doc.views > prev) channels.set(doc.channelId, doc.views);
      if (examples) {
        const arr = examples.get(term) ?? [];
        arr.push({ title: doc.title, views: doc.views });
        examples.set(term, arr);
      }
      if (context && cx) {
        const acc = context.get(term) ?? { food: 0, nonfood: 0, total: 0 };
        acc.total += 1;
        if (cx.food) acc.food += 1;
        if (cx.nonfood) acc.nonfood += 1;
        context.set(term, acc);
      }
    }
  }
  return index;
}

/** 그 용어가 실제로 어떤 영상에서 나왔는지 — 조회수 높은 제목 2개 (중복 제거). */
function pickExamples(examples: ExampleIndex, term: string, n = 2): string[] {
  const seen = new Set<string>();
  return (examples.get(term) ?? [])
    .slice()
    .sort((a, b) => b.views - a.views)
    .map((e) => e.title.trim())
    .filter((t) => t && !seen.has(t) && (seen.add(t), true))
    .slice(0, n);
}

/**
 * `#foodhacks` 와 `foodhacks` 는 같은 트렌드다. 하나로 합치고, 해시태그로도
 * 쓰였다는 사실만 표시로 남긴다. (합치지 않으면 랭킹이 절반씩 중복된다)
 */
function mergeHashtags(index: ChannelIndex): Set<string> {
  const hashtagged = new Set<string>();
  for (const [term, channels] of [...index.entries()]) {
    if (!term.startsWith("#")) continue;
    const plain = term.slice(1);
    hashtagged.add(plain);
    const target = index.get(plain);
    if (target) {
      for (const [ch, views] of channels) {
        if (views > (target.get(ch) ?? 0)) target.set(ch, views);
      }
    } else {
      index.set(plain, channels);
    }
    index.delete(term);
  }
  return hashtagged;
}

function distinctChannels(docs: Doc[]): number {
  return new Set(docs.map((d) => d.channelId)).size;
}

/**
 * `ice` · `cream` · `ice cream` · `icecream` 은 한 트렌드인데 네 줄을 차지한다.
 * **채널 집합이 완전히 같으면** 같은 현상을 다르게 부른 것이므로 하나만 남긴다.
 * 대표는 가장 구체적인 표현 — 띄어쓴 2어절 > 긴 단어 순.
 */
function dropSynonyms<T extends { term: string; channelKey: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const kept = best.get(row.channelKey);
    if (!kept) {
      best.set(row.channelKey, row);
      continue;
    }
    const moreSpecific =
      Number(row.term.includes(" ")) - Number(kept.term.includes(" ")) ||
      row.term.length - kept.term.length;
    if (moreSpecific > 0) best.set(row.channelKey, row);
  }
  const survivors = new Set([...best.values()]);
  return rows.filter((r) => survivors.has(r));
}

/**
 * 채널명을 후보에서 뺀다.
 *
 * 창작자가 제목에 자기 채널명을 넣는 일이 잦아, 채널명이 "여러 영상에서 반복되는
 * 신조어"처럼 보인다. 예측력 백테스트에서 `이웃집통통`(×48.2)이 최고 히트로
 * 잡혔는데 유튜브 채널명이었다. `여수언니`·`포비빅`도 같은 경우다.
 *
 * 채널 제목을 정규화해 후보 용어가 거기 포함되면 버린다.
 */
function dropChannelNames<T extends { term: string }>(rows: T[], docs: Doc[]): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const names = new Set<string>();
  for (const d of docs) {
    const n = norm(d.channelTitle);
    if (n.length >= 2) names.add(n);
  }
  if (!names.size) return rows;
  return rows.filter((r) => {
    const t = norm(r.term);
    if (t.length < 2) return true;
    for (const n of names) {
      // 채널명과 같거나, 채널명 안에 통째로 들어가면 채널 유래로 본다.
      if (n === t || (t.length >= 3 && n.includes(t))) return false;
    }
    return true;
  });
}

/**
 * 더 구체적인 후보의 조각인 용어를 뺀다.
 *
 * 토큰화 과정에서 `두바이초콜릿`과 함께 `두바`·`초콜릿`이 따로 후보로 올라온다.
 * 트렌드의 실체는 구체어 쪽이고, 조각·상위 카테고리어는 계절성 노이즈만 끌어온다
 * (백테스트에서 `초콜릿`·`초콜렛`이 발렌타인 시즌 상승으로 히트 판정을 받았다).
 *
 * 앞선 순위(=더 강한 신호)의 용어에 부분 문자열로 포함되면 버린다.
 */
/**
 * 상위어에 흡수되는 조각을 버린다. 단, **조각이 상위어보다 훨씬 많은 채널로 번졌으면
 * 독립 트렌드로 보고 살린다.**
 *   예: "미쯔 황치즈"만 있으면 "황치즈"는 그 조각이라 버리지만, "황치즈"가 다른 제품
 *       영상에도 퍼져 채널이 {margin}개 이상 더 많으면 재료·맛 트렌드로 따로 남긴다.
 * (조각은 상위어의 상위집합이라 dfRecent 는 항상 상위어 이상이다.)
 */
const FRAGMENT_KEEP_MARGIN = 2;
function dropFragments<T extends { term: string; dfRecent: number }>(rows: T[]): T[] {
  const kept: T[] = [];
  for (const r of rows) {
    const t = r.term.toLowerCase();
    const isFragment = kept.some((k) => {
      const s = k.term.toLowerCase();
      if (s === t || !s.includes(t) || t.length >= s.length) return false;
      // 조각이 상위어보다 채널 margin개 이상 더 많으면 흡수하지 않는다.
      return r.dfRecent < k.dfRecent + FRAGMENT_KEEP_MARGIN;
    });
    if (!isFragment) kept.push(r);
  }
  return kept;
}

export async function POST(request: Request) {
  let body: {
    seeds?: string[];
    region?: string;
    recentDays?: number;
    baselineStartDays?: number;
    baselineEndDays?: number;
    topN?: number;
    /**
     * 발굴 기준 시점 (ISO). 생략하면 현재.
     * 과거 날짜를 주면 "그 시점에 발굴했다면 무엇을 집었을까"를 재현한다 —
     * 이후 데이터를 전혀 보지 않으므로 예측력 백테스트에 쓸 수 있다.
     */
    asOf?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const seeds = (body.seeds ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SEEDS);
  if (!seeds.length) {
    return NextResponse.json({ error: "시드 키워드가 최소 1개 필요합니다." }, { status: 400 });
  }

  const region = (body.region ?? "US").toUpperCase();
  // 짧을수록 좋다 — order=date라 창을 넓히면 오래된 업로드가 아니라 표본만 흐려진다.
  const recentDays = Math.min(Math.max(body.recentDays ?? 14, 7), 120);
  const baselineStartDays = Math.min(Math.max(body.baselineStartDays ?? 365, 60), 730);
  const baselineEndDays = Math.min(Math.max(body.baselineEndDays ?? 90, 30), baselineStartDays - 30);
  const topN = Math.min(Math.max(body.topN ?? 20, 5), 100);

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "YouTube API 키가 설정되지 않았습니다. (.env.local의 YOUTUBE_API_KEY)" },
      { status: 500 },
    );
  }

  // 기준 시점. asOf 를 주면 그 시점의 관측자로 행세한다 (이후 데이터는 보지 않는다).
  const asOfMs = body.asOf ? Date.parse(body.asOf) : Date.now();
  if (Number.isNaN(asOfMs)) {
    return NextResponse.json({ error: "asOf 날짜를 해석할 수 없습니다." }, { status: 400 });
  }
  const now = Math.min(asOfMs, Date.now());
  const isBacktest = Boolean(body.asOf);
  const iso = (daysAgo: number) => new Date(now - daysAgo * MS_PER_DAY).toISOString();

  const recent: Doc[] = [];
  const baseline: Doc[] = [];
  const errors: string[] = [];
  let units = 0;

  for (const seed of seeds) {
    try {
      const [r, b] = await Promise.all([
        // 최근 코퍼스 R — 지금 조회수가 터지는 영상.
        // 백테스트에서는 기준 시점 이후 영상이 새어 들어오지 않도록 상한을 건다.
        fetchCorpus(
          key,
          seed,
          region,
          iso(recentDays),
          isBacktest ? new Date(now).toISOString() : undefined,
          RECENT_PAGES,
        ),
        // 기준선 B — "원래도 흔하던 말"의 기준. 캐시되면 쿼터 0.
        fetchBaseline(key, seed, region, iso(baselineStartDays), iso(baselineEndDays)),
      ]);
      recent.push(...r.docs);
      baseline.push(...b.docs);
      units += r.units + b.units;
    } catch (e) {
      errors.push(`${seed}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!recent.length) {
    const joined = errors.join(" / ");
    const quotaHit = /429|quota/i.test(joined);
    return NextResponse.json(
      {
        error: quotaHit
          ? "YouTube 일일 쿼터를 모두 썼습니다. 내일(태평양시 자정) 초기화된 뒤 다시 시도하세요."
          : "최근 영상을 가져오지 못했습니다.",
        detail: quotaHit
          ? `발굴 1회는 시드당 검색 ${RECENT_PAGES + BASELINE_PAGES}회(약 ${
              (RECENT_PAGES + BASELINE_PAGES) * SEARCH_UNITS
            } units)를 씁니다. 기본 쿼터는 하루 10,000 units입니다.`
          : joined || `${region} 지역 결과가 비어 있습니다.`,
      },
      { status: quotaHit ? 429 : 502 },
    );
  }

  // 다국어 영상 제거 — regionCode/relevanceLanguage는 강제가 아니다.
  const locale = localeForRegion(region);
  const keep = localePredicate(locale);
  const R = filterByLocale(recent, keep);
  const B = filterByLocale(baseline, keep);
  const droppedByLang = recent.length - R.length + (baseline.length - B.length);

  // 모든 시드 토큰은 후보에서 제외 (시드 자신이 1위로 뜨는 것을 막는다)
  const seedTokens = new Set<string>();
  for (const seed of seeds) for (const t of seedTokenSet(seed)) seedTokens.add(t);

  const examples: ExampleIndex = new Map();
  const contextIdx: ContextIndex = new Map();
  const recentIndex = indexTerms(R, seedTokens, examples, contextIdx);
  const baselineIndex = indexTerms(B, seedTokens);
  const hashtagged = mergeHashtags(recentIndex);
  mergeHashtags(baselineIndex);

  // 분모도 채널 수 — "몇 개 채널 중 몇 개가 이 말을 쓰는가"
  const nR = distinctChannels(R);
  const nB = distinctChannels(B);

  const scored = [...recentIndex.entries()]
    .filter(([, channels]) => channels.size >= MIN_RECENT_CHANNELS)
    .map(([term, channels]) => {
      const chRecent = channels.size;
      const chBaseline = baselineIndex.get(term)?.size ?? 0;
      // 채널별 최고 조회수만 합산 — 한 채널의 대량 업로드로 부풀지 않는다.
      const views = [...channels.values()].reduce((a, v) => a + v, 0);

      const pR = chRecent / nR;
      const pB = nB ? chBaseline / nB : 0;
      const lift = Math.min(pR / (pB + SMOOTHING_K / (nB + SMOOTHING_K)), MAX_LIFT);

      return {
        term,
        dfRecent: chRecent,
        dfBaseline: chBaseline,
        // 최근 코퍼스에서 이 용어가 등장한 영상(제목) 수 — contextIdx.total이 곧 영상 수.
        videosRecent: contextIdx.get(term)?.total ?? chRecent,
        lift: Number(lift.toFixed(1)),
        views,
        hashtag: hashtagged.has(term),
        novel: chBaseline === 0,
        channelKey: [...channels.keys()].sort().join("|"),
      };
    })
    // 점수는 lift 단독. 동점이면 더 많은 채널로 번진 쪽이 위.
    .sort((a, b) => b.lift - a.lift || b.dfRecent - a.dfRecent);

  const deduped = dropFragments(dropChannelNames(dropSynonyms(scored), recent));

  // 식품 맥락은 **소프트 신호** — 후보를 제거하지 않고 순위만 조정한다.
  // 신호 없는 용어(neutral)는 중간에 그대로 남아 신조어가 죽지 않는다.
  const withContext = deduped.map((c) => {
    const acc = contextIdx.get(c.term) ?? { food: 0, nonfood: 0, total: 0 };
    const { tag, foodShare } = contextTagOf(acc.food, acc.nonfood, acc.total);
    return { ...c, contextTag: tag, foodShare: Number(foodShare.toFixed(2)) };
  });
  withContext.sort(
    (a, b) =>
      CONTEXT_RANK[b.contextTag] - CONTEXT_RANK[a.contextTag] ||
      b.lift - a.lift ||
      b.dfRecent - a.dfRecent,
  );

  // 점수는 급증 배수 기준 그대로 (맥락 정렬과 무관하게 통계는 정직하게)
  const max = Math.max(...withContext.map((c) => c.lift), 1);
  const candidates = withContext.slice(0, topN).map((c) => ({
    term: c.term,
    dfRecent: c.dfRecent,
    dfBaseline: c.dfBaseline,
    videosRecent: c.videosRecent,
    lift: c.lift,
    views: c.views,
    hashtag: c.hashtag,
    novel: c.novel,
    score: Math.round((c.lift / max) * 100),
    examples: pickExamples(examples, c.term),
    contextTag: c.contextTag,
    foodShare: c.foodShare,
  }));

  // SNS 확산 흐름 — 후보별 예시 2건이 아니라 **최근 영상 전체**(제목 + 설명 앞부분)로
  // 확산 이유(테마)를 집계한다. 표본이 두꺼워져 테마별 근거 영상 수가 실제 규모를 반영한다.
  // 시드 간 같은 영상이 겹치면 고유 영상 1건으로만 세도록 ID 기준 중복 제거(ID 없으면
  // 제목+채널로 폴백)한다 — "근거 영상 수"가 고유 영상 수를 정확히 반영하게.
  const seenFlow = new Set<string>();
  const flowTexts: string[] = [];
  for (const d of R) {
    const key = d.id || `${d.title} ${d.channelId}`;
    if (seenFlow.has(key)) continue;
    seenFlow.add(key);
    flowTexts.push(`${d.title} ${(d.desc ?? "").slice(0, 200)}`);
  }
  const flow = flowTexts.length ? analyzeReasons(flowTexts, locale as ReasonLocale) : undefined;

  return NextResponse.json({
    region,
    locale,
    seeds,
    window: { recentDays, baselineStartDays, baselineEndDays },
    counts: {
      recentDocs: R.length,
      baselineDocs: B.length,
      recentChannels: nR,
      baselineChannels: nB,
      droppedByLang,
      terms: recentIndex.size,
    },
    quotaUnits: units,
    ytError: errors.length ? errors.join(" / ") : undefined,
    candidates,
    flow,
  });
}
