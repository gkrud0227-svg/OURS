import { NextResponse } from "next/server";
import {
  dictLookup,
  splitWords,
  combineSpellings,
  verifySpellings,
  type SpellingResult,
} from "@/lib/translit";
import { parseAutocomplete } from "@/lib/naver-ac";
import { pickTransliteration } from "@/lib/skeleton";

/**
 * 해외 후보(영어) → 국내 검색어(한글) 표기 변환.
 *
 *   POST { terms: string[] } → { results: SpellingResult[] }
 *
 * **어절 단위**로 푼다. 사전 → 네이버 검색 발굴 순으로 낱말마다 표기를 찾고, 그 다음 합친다.
 * (`croissant magnum` 은 croissant 만 사전에 있고 magnum 은 없다 — 통째로 다루면 못 푼다.)
 * 마지막에 자동완성으로 실재를 확인한다.
 *
 * ⚠️ LLM 을 쓰지 않는다. 예전엔 Anthropic API 폴백을 뒀는데 유료라 쓸 수 없어,
 *    이미 있는 네이버 자격증명만으로 푸는 방식으로 바꿨다. 원리는 이렇다.
 *
 *      1) 영어 낱말을 네이버 백과사전·지식iN 에 검색하면 한국인이 쓴 본문이 나온다.
 *         그 안에 음차 표기가 들어 있다 (biryani → "비리야니", magnum → "매그넘").
 *      2) 어느 한글 낱말이 음차인지는 **빈도로 못 고른다** — burrata 검색 결과에서
 *         "치즈"(5회)가 "부라타"(4회)보다 많다.
 *      3) 그래서 **자음 골격**으로 고른다 (lib/skeleton.ts). 한글 음차는 자음 사이에
 *         "으"를 끼워 넣어 모음이 어긋나므로, 자음만 남겨 비교하면 원어와 맞는다.
 *
 * ⚠️ 표기를 확정하지 못한 후보도 `spellings: []` 로 **반드시 돌려준다.** 조용히 빼면
 *    호출자가 "국내 신호 없음"과 "표기를 못 맞춤"을 구분할 수 없다.
 */

const AC = "https://ac.search.naver.com/nx/ac";
const AC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Referer: "https://www.naver.com/",
  Accept: "application/json, text/plain, */*",
};
const SEARCH = "https://openapi.naver.com/v1/search";
/** 음차가 본문에 나올 만한 한국어 코퍼스. 백과사전이 정확하고, 지식iN 이 신조어를 덮는다. */
const SEARCH_KINDS = ["encyc", "kin"] as const;

/** 한 번에 처리할 후보 수 상한. */
const MAX_TERMS = 30;
/** 검색으로 표기를 찾아볼 낱말 수 상한 — 낱말당 외부 호출 2회라 여기서 막는다. */
const MAX_LOOKUP_WORDS = 40;
/** 검색 결과에서 뽑을 한글 낱말 길이 범위. 짧으면 조사, 길면 문장 조각이다. */
const KO_WORD = /[가-힣]{2,12}/g;

/** 자동완성 한 번 — 그 표기로 실제 완성어가 나오는지 본다. */
async function completionsFor(spelling: string): Promise<string[]> {
  const url = `${AC}?q=${encodeURIComponent(spelling)}&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&st=100&q_enc=UTF-8`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(url, { headers: AC_HEADERS, cache: "no-store", signal: ac.signal });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return json ? parseAutocomplete(json) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const stripTags = (s: string) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");

/** 네이버 검색 결과 본문에서 한글 낱말 후보를 모은다. */
async function koreanWordsFor(word: string, id: string, secret: string): Promise<string[]> {
  const words = new Set<string>();
  for (const kind of SEARCH_KINDS) {
    const url = `${SEARCH}/${kind}.json?query=${encodeURIComponent(word)}&display=10`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8_000);
    try {
      const res = await fetch(url, {
        headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { items?: { title?: string; description?: string }[] };
      for (const it of json.items ?? []) {
        const text = `${stripTags(it.title ?? "")} ${stripTags(it.description ?? "")}`;
        for (const w of text.match(KO_WORD) ?? []) words.add(w);
      }
    } catch {
      // 이 코퍼스만 건너뛴다 — 다른 코퍼스가 찾아줄 수 있다
    } finally {
      clearTimeout(timer);
    }
  }
  return [...words];
}

export async function POST(request: Request) {
  let body: { terms?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  if (!terms.length) {
    return NextResponse.json({ error: "변환할 키워드를 하나 이상 입력하세요." }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  // 1) 모든 후보의 어절을 모아 **중복 없이** 한 번씩만 해결한다.
  //    "croissant magnum" 과 "magnum croissant" 는 같은 낱말 둘을 공유한다.
  const byWord = new Map<string, { spellings: string[] | null; fromDict: boolean }>();
  for (const term of terms) {
    for (const w of splitWords(term)) {
      if (byWord.has(w)) continue;
      const hit = dictLookup(w);
      byWord.set(w, { spellings: hit, fromDict: Boolean(hit) });
    }
  }

  // 2) 사전이 모르는 낱말만 검색으로 찾는다.
  const unresolved = [...byWord.entries()]
    .filter(([, v]) => !v.spellings)
    .map(([w]) => w)
    .slice(0, MAX_LOOKUP_WORDS);
  if (clientId && clientSecret && unresolved.length) {
    await Promise.all(
      unresolved.map(async (w) => {
        const words = await koreanWordsFor(w, clientId, clientSecret);
        const picked = pickTransliteration(w, words);
        if (picked) byWord.set(w, { spellings: [picked], fromDict: false });
      }),
    );
  }

  // 3) 어절 표기를 합치고, 자동완성으로 실재를 확인한다.
  const results: SpellingResult[] = await Promise.all(
    terms.map(async (term) => {
      const words = splitWords(term);
      const perWord: string[][] = [];
      let allFromDict = true;
      for (const w of words) {
        const hit = byWord.get(w)?.spellings;
        // 한 낱말이라도 못 풀면 그 후보는 표기 미확인이다 — 반쪽 표기로 검색하면 엉뚱한 값이 나온다.
        if (!hit?.length) return { term, spellings: [], source: "none", verified: false };
        if (!byWord.get(w)?.fromDict) allFromDict = false;
        perWord.push(hit);
      }
      const candidates = combineSpellings(perWord);
      if (!candidates.length) return { term, spellings: [], source: "none", verified: false };

      const source: SpellingResult["source"] = allFromDict ? "dict" : "search";
      const completions = (await Promise.all(candidates.map((c) => completionsFor(c)))).flat();
      const verified = verifySpellings(candidates, completions);
      return verified.length
        ? { term, spellings: verified, source, verified: true }
        : // 자동완성이 확인해주지 못했다 — 표기는 남기되 미검증으로 표시한다.
          //  (자동완성이 일시적으로 막히는 경우도 있어 후보를 통째로 버리지 않는다)
          { term, spellings: candidates, source, verified: false };
    }),
  );

  return NextResponse.json({ results });
}
