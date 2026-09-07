import { NextResponse } from "next/server";
import { readNewsHistory, writeNewsHistory } from "@/lib/news-history-store";
import { docTerms } from "@/lib/cooccurrence";
import { contextOf } from "@/lib/food-context";
import { noveltyOf, updateHistory } from "@/lib/news-novelty";

/**
 * 해외 식품 매체 스캔 — 주요 음식 언론의 RSS를 모아, 헤드라인·요약에서 후보 키워드를
 * 뽑고 **여러 매체에 동시에 등장하는 단어**를 상위로 올린다(= 에디토리얼 신호).
 *
 * 왜 RSS인가: 신문사가 공개 배포하는 표준 피드라 크롤링(ToS·차단 위험)보다 합법·안정적이고,
 * 트렌드 이름은 보통 헤드라인·요약에 담긴다. LLM 없이 우리 term 엔진으로 처리한다.
 *
 * ⚠️ 로컬 dev/서버에서 외부 RSS를 가져온다(HTTPS). 회사망 방화벽이 SMTP는 막아도 HTTPS는 허용.
 */

/**
 * 매체 구분 — 해외 발굴 랭킹은 **해외 매체만** 봐야 한다.
 * 국내 전문지를 섞으면 후보가 한국 기사 상투어(추석·영업자·알린다)로 뒤덮인다.
 */
type FeedRegion = "overseas" | "domestic";

const FEEDS: { name: string; url: string; region: FeedRegion }[] = [
  { name: "The Guardian Food", url: "https://www.theguardian.com/food/rss", region: "overseas" },
  { name: "Eater", url: "https://www.eater.com/rss/index.xml", region: "overseas" },
  { name: "BBC Good Food", url: "https://www.bbcgoodfood.com/feed", region: "overseas" },
  { name: "Delish", url: "https://www.delish.com/rss/all.xml/", region: "overseas" },
  { name: "NYT Dining", url: "https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml", region: "overseas" },
  { name: "The Kitchn", url: "https://www.thekitchn.com/main.rss", region: "overseas" },
  { name: "Tasting Table", url: "https://www.tastingtable.com/feed/", region: "overseas" },
  { name: "Bon Appetit", url: "https://www.bonappetit.com/feed/rss", region: "overseas" },
  // 국내 식품 전문지 — 신제품·트렌드가 제품명 그대로 기사화된다(발굴에 직접적).
  { name: "식품저널", url: "https://www.foodnews.co.kr/rss/allArticle.xml", region: "domestic" },
  { name: "식품음료신문", url: "https://www.thinkfood.co.kr/rss/allArticle.xml", region: "domestic" },
  { name: "식품외식경제", url: "https://www.foodbank.co.kr/rss/allArticle.xml", region: "domestic" },
  { name: "K-Food Times", url: "https://www.kfoodtimes.com/rss/allArticle.xml", region: "domestic" },
];

const MS = 12_000;
const BODY_MS = 10_000; // 기사 본문 fetch 타임아웃
/**
 * 매체당 본문까지 긁을 기사 수.
 *
 * RSS 항목의 **제목+요약은 전부** 집계에 들어가고(매체당 10~50건), 여기서 정하는 건
 * 본문까지 받아올 기사 수다. 트렌드 이름은 요약보다 본문에 자주 나오므로 늘릴수록
 * 발굴력이 오르지만 스캔 시간도 같이 는다(실측: 3건일 때 약 3초).
 *
 * ⚠️ RSS 는 최신 N건만 담는 규격이라 **과거를 요청할 수 없다.** 실측한 피드 깊이는
 *    Tasting Table 0.6일 · Kitchn 2.6일 · Delish 9.3일 · Eater 24일치다. 한 달치를
 *    보려면 매일 스캔해 이력에 쌓는 수밖에 없다(그래서 일일 크론을 둔다).
 */
const BODIES_PER_FEED = 10;

/** HTML 엔티티·잔여 태그 정리(공통). */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&#8217;|&#x27;/gi, "'")
    .replace(/&quot;|&#8220;|&#8221;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 기사 HTML → **문단(<p>)만** 추출. 네비/메뉴/푸터/쿠키배너는 대부분 <a>·<li>·<button>이라
 * <p>만 모으면 실제 기사 본문에 근접한다(readability 라이브러리 없이 정밀도 향상).
 * 문단이 너무 적으면(<p> 없는 사이트) 전체 텍스트로 폴백.
 */
function htmlToBody(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const paras = (noScript.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) ?? [])
    .map((p) => stripTags(p))
    .filter((t) => t.length >= 40); // 짧은 캡션·크레딧 문단 제외
  if (paras.length >= 3) return paras.join(" ");
  return stripTags(noScript); // 폴백
}

/** CDATA·HTML 태그·기본 엔티티 제거. */
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&#8217;|&#x27;/gi, "'")
    .replace(/&quot;|&#8220;|&#8221;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** RSS(item) / Atom(entry) 에서 제목+요약+링크를 뽑는다. 라이브러리 없이 정규식 근사. */
function parseItems(xml: string): { title: string; summary: string; link: string }[] {
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  return blocks.slice(0, 40).map((b) => {
    const title = clean((b.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
    const summary = clean(
      b.match(/<(?:description|summary|content)\b[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i)?.[1] ??
        "",
    );
    // RSS: <link>URL</link> / Atom: <link href="URL"/>
    const href = b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const linkText = b.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1];
    const link = clean(href ?? linkText ?? "");
    return { title, summary, link };
  });
}

interface NewsTerm {
  term: string;
  count: number;
  sources: string[];
  sample: string;
  /** 에디토리얼 lift — 이력 대비 신규/급부상 여부 */
  novelty: "new" | "rising" | "known" | "baseline";
}

/**
 * Vercel 함수 상한. 실측 스캔 시간은 매체 8곳 · 본문 80건에 약 8초라 여유가 있지만,
 * 매체 응답이 느린 날 강제 종료되지 않도록 Hobby 상한까지 열어 둔다.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  // ?region=overseas 면 해외 매체만 스캔한다 (해외 발굴 랭킹용).
  const wanted = new URL(request.url).searchParams.get("region");
  const feeds =
    wanted === "overseas" || wanted === "domestic"
      ? FEEDS.filter((f) => f.region === wanted)
      : FEEDS;
  const settled = await Promise.allSettled(
    feeds.map(async (f) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), MS);
      try {
        const res = await fetch(f.url, {
          signal: ac.signal,
          headers: { "User-Agent": "Mozilla/5.0 (trend-dashboard news scan)" },
          cache: "no-store",
        });
        if (!res.ok) return { name: f.name, items: [] as ReturnType<typeof parseItems> };
        return { name: f.name, items: parseItems(await res.text()) };
      } catch {
        return { name: f.name, items: [] as ReturnType<typeof parseItems> };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const okFeeds: string[] = [];
  const failFeeds: string[] = [];
  // term → { count, sources:Set, sample headline }
  const agg = new Map<string, { count: number; sources: Set<string>; sample: string; food: boolean }>();
  const empty = new Set<string>();

  // ── 최신 기사 본문 크롤링 대상 수집(매체당 상위 N건, 유효 링크만) ──
  const crawlTargets: { source: string; title: string; link: string }[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status !== "fulfilled" || s.value.items.length === 0) continue;
    const feedName = feeds[i].name;
    for (const it of s.value.items.slice(0, BODIES_PER_FEED)) {
      if (/^https?:\/\//i.test(it.link)) crawlTargets.push({ source: feedName, title: it.title, link: it.link });
    }
  }

  // 본문을 병렬로 가져와 태그를 벗긴다(실패는 무시 — RSS 요약이 폴백).
  const bodies = await Promise.allSettled(
    crawlTargets.map(async (t) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), BODY_MS);
      try {
        const res = await fetch(t.link, {
          signal: ac.signal,
          headers: { "User-Agent": "Mozilla/5.0 (trend-dashboard article fetch)" },
          cache: "no-store",
        });
        if (!res.ok) return { ...t, body: "" };
        return { ...t, body: htmlToBody(await res.text()).slice(0, 20000) };
      } catch {
        return { ...t, body: "" };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  // 본문 term 집계 — 제목+본문을 문장 단위로 돌린다(기사당 1회 count).
  let crawledCount = 0;
  for (const b of bodies) {
    if (b.status !== "fulfilled" || !b.value.body) continue;
    crawledCount += 1;
    const { source, title, body } = b.value;
    const seen = new Set<string>(); // 한 기사에서 같은 term은 1회만 count
    for (const sentence of `${title}. ${body}`.split(/[\n.!?。！？]+/)) {
      const cx = contextOf(sentence);
      // 본문 산문은 노이즈가 크다 — **식품맥락 문장에서 나온 term만** 채택(정밀도).
      // (트렌드 이름은 보통 음식어와 같은 문장에 등장하므로 recall 손실은 작다)
      if (!cx.food) continue;
      for (const term of docTerms(sentence, empty, { hashtags: true })) {
        if (term.includes(" ")) continue; // 산문 bigram 제외
        if (seen.has(term)) continue;
        seen.add(term);
        const cur = agg.get(term) ?? { count: 0, sources: new Set<string>(), sample: title, food: true };
        cur.count += 1;
        cur.sources.add(source);
        cur.food = true;
        agg.set(term, cur);
      }
    }
  }

  // ── RSS 제목+요약 집계(넓은 커버리지 — 본문 크롤 실패분까지 포함) ──
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const feedName = feeds[i].name;
    if (s.status !== "fulfilled" || s.value.items.length === 0) {
      failFeeds.push(feedName);
      continue;
    }
    okFeeds.push(feedName);
    for (const it of s.value.items) {
      const headline = it.title;
      const blob = `${it.title}. ${it.summary}`;
      const cx = contextOf(blob);
      for (const term of docTerms(blob, empty, { hashtags: true })) {
        if (term.includes(" ")) continue; // 산문 bigram 제외
        const cur = agg.get(term) ?? { count: 0, sources: new Set<string>(), sample: headline, food: false };
        cur.count += 1;
        cur.sources.add(feedName);
        if (cx.food) cur.food = true;
        agg.set(term, cur);
      }
    }
  }

  // 후보만 추린다(식품맥락 or 2곳 이상).
  const cands = [...agg.entries()]
    .map(([term, v]) => ({ term, count: v.count, sources: [...v.sources], sample: v.sample, food: v.food }))
    .filter((t) => t.food || t.count >= 2);

  // ── 에디토리얼 lift: 이력 대비 신규/급부상 판정 ──
  // 기준선은 이번에 실제로 스캔한 매체 구분의 이력과 대조한다.
  const regionKey = wanted === "overseas" || wanted === "domestic" ? wanted : undefined;
  const history = await readNewsHistory(regionKey);
  const baselineJustSet = Object.keys(history).length === 0; // 첫 스캔이면 전부 기준선
  const now = new Date().toISOString();


  const scored: NewsTerm[] = cands.map((t) => {
    const novelty = noveltyOf(t.sources.length, history[t.term], baselineJustSet);
    return { term: t.term, count: t.count, sources: t.sources, sample: t.sample, novelty };
  });

  // 이력 갱신 — 이번 후보들을 기록/누적.
  for (const t of cands) {
    history[t.term] = updateHistory(history[t.term], t.sources.length, now);
  }
  await writeNewsHistory(history, regionKey);

  // 정렬: 신규 > 급부상 > 나머지, 그다음 크로스소스 → 빈도.
  const rank = (n: NewsTerm["novelty"]) => (n === "new" ? 3 : n === "rising" ? 2 : 0);
  const terms = scored
    .sort(
      (a, b) => rank(b.novelty) - rank(a.novelty) || b.sources.length - a.sources.length || b.count - a.count,
    )
    .slice(0, 50);

  return NextResponse.json({
    terms,
    scanned: okFeeds,
    failed: failFeeds,
    crawled: crawledCount,
    articles: crawlTargets.length,
    baselineJustSet,
  });
}
