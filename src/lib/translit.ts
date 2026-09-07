/**
 * 해외 후보(영어) → **국내 검색어(한글) 표기** 변환.
 *
 * 데이터랩은 한국어 검색어를 봐야 하는데 해외 발굴 후보는 영어다. `dubai chocolate` 을
 * 그대로 넣으면 국내 신호가 0으로 나오고, 그러면 "아직 안 들어옴"으로 오판한다.
 *
 * 3단계로 푼다.
 *   1) **사전** — 자주 나오는 식품어는 고정 표기가 있다. 호출 없이 즉시 해결된다.
 *   2) **네이버 검색 발굴** — 사전에 없는 말은 백과사전·지식iN 본문에서 음차를 찾는다.
 *      어느 낱말이 음차인지는 자음 골격으로 고른다 (lib/skeleton.ts). LLM 은 쓰지 않는다.
 *   3) **자동완성 검증** — 1·2가 낸 표기 후보를 네이버 자동완성에 넣어 **실제로 사람들이
 *      검색하는 말인지** 확인한다. 잘못 고른 표기를 여기서 걸러낸다.
 *
 * ⚠️ 검증에 실패한 후보는 **버리지 않고 표기 미확인으로 남긴다.** 국내 검색 0이
 *    "아직 안 들어옴"인지 "표기를 못 맞춘 것"인지 구분돼야 하기 때문이다.
 */

/**
 * 고정 표기 사전 — 식품 트렌드에서 반복되는 말들.
 * 검색 발굴을 줄이는 것보다 **표기를 일관되게 고정**하는 목적이 크다 — 검색에서 뽑으면
 * 같은 말이 회차마다 "크로와상"/"크루아상"으로 달라질 수 있다.
 */
const DICT: Record<string, string[]> = {
  croissant: ["크루아상", "크로와상"],
  crookie: ["크루키"],
  cronut: ["크로넛"],
  bagel: ["베이글"],
  pretzel: ["프레첼"],
  tiramisu: ["티라미수"],
  matcha: ["말차", "마차"],
  pistachio: ["피스타치오"],
  knafeh: ["크나페", "카나페"],
  kunafa: ["크나페"],
  ube: ["우베"],
  mochi: ["모찌"],
  dalgona: ["달고나"],
  burrata: ["부라타"],
  focaccia: ["포카치아"],
  cannoli: ["카놀리"],
  churro: ["츄러스"],
  churros: ["츄러스"],
  gelato: ["젤라또", "젤라토"],
  macaron: ["마카롱"],
  brownie: ["브라우니"],
  cheesecake: ["치즈케이크"],
  pancake: ["팬케이크"],
  waffle: ["와플"],
  donut: ["도넛"],
  doughnut: ["도넛"],
  cookie: ["쿠키"],
  brookie: ["브루키"],
  dubai: ["두바이"],
  chocolate: ["초콜릿", "초콜렛"],
  strawberry: ["딸기"],
  banana: ["바나나"],
  mango: ["망고"],
  lemon: ["레몬"],
  butter: ["버터"],
  caramel: ["카라멜", "캐러멜"],
  vanilla: ["바닐라"],
  honey: ["꿀"],
  cheese: ["치즈"],
  yogurt: ["요거트"],
  boba: ["버블티"],
  latte: ["라떼"],
};

const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/^#/, "");

/** 낱말 하나를 사전에서 찾는다. 없으면 null — 라우트가 검색 발굴로 넘긴다. */
export function dictLookup(word: string): string[] | null {
  return DICT[norm(word)] ?? null;
}

/** 후보 용어를 어절로 쪼갠다. */
export function splitWords(term: string): string[] {
  return norm(term).split(/\s+/).filter(Boolean);
}

/**
 * 어절별 표기 후보를 하나의 검색어로 합친다 (순수 함수 · 검증 대상).
 *
 * `[["두바이"], ["초콜릿","초콜렛"]]`
 *   → `두바이 초콜릿` · `두바이초콜릿` · `두바이 초콜렛` · `두바이초콜렛`
 *
 * 띄어쓰기 두 형태를 모두 만드는 이유는 사람마다 다르게 검색하기 때문이다.
 * 어느 쪽이 실제로 쓰이는지는 뒤의 자동완성 검증이 가려낸다.
 */
export function combineSpellings(perWord: string[][]): string[] {
  if (!perWord.length || perWord.some((v) => !v.length)) return [];

  // 각 낱말의 첫 표기만 조합한다 — 조합 폭발을 막고, 대안 표기는 아래에서 따로 더한다.
  const primary = perWord.map((v) => v[0]);
  const out = new Set<string>();
  out.add(primary.join(" "));
  if (primary.length > 1) out.add(primary.join(""));

  // 대안 표기는 **한 자리만** 바꿔 만든다 (크루아상↔크로와상).
  for (let i = 0; i < perWord.length; i += 1) {
    for (const alt of perWord[i].slice(1)) {
      const variant = [...primary];
      variant[i] = alt;
      out.add(variant.join(" "));
      if (variant.length > 1) out.add(variant.join(""));
    }
  }
  return [...out];
}

/**
 * 사전만으로 표기 후보를 만든다.
 * 한 낱말이라도 사전에 없으면 빈 배열 — 라우트가 그 낱말만 검색으로 찾아 채운다.
 */
export function spellFromDict(term: string): string[] {
  const words = splitWords(term);
  if (!words.length) return [];
  const perWord: string[][] = [];
  for (const w of words) {
    const hit = dictLookup(w);
    if (!hit) return [];
    perWord.push(hit);
  }
  return combineSpellings(perWord);
}

/** 표기 후보가 한글을 담고 있는가. */
export function looksKorean(s: string): boolean {
  return /[가-힣]/.test(s ?? "");
}

export interface SpellingResult {
  term: string;
  /** 검증까지 통과한 표기. 비어 있으면 표기 미확인. */
  spellings: string[];
  /** 어디서 나왔는가 — 화면·로그용. */
  source: "dict" | "search" | "none";
  /** 자동완성으로 실재를 확인했는가. */
  verified: boolean;
}

/**
 * 자동완성 결과로 표기 후보를 거른다 (순수 함수 · 검증 대상).
 *
 * 자동완성이 그 표기로 완성어를 돌려준다면 실제로 검색되는 말이다.
 * 완성어 목록에 표기가 **부분 문자열로** 들어 있으면 통과로 본다
 * (예: "두바이 초콜릿" → 완성어 "두바이 초콜릿 만들기"에 포함).
 */
export function verifySpellings(spellings: string[], completions: string[]): string[] {
  const flat = completions.map((c) => c.replace(/\s+/g, "").toLowerCase());
  return spellings.filter((s) => {
    const k = s.replace(/\s+/g, "").toLowerCase();
    return flat.some((c) => c.includes(k));
  });
}

/** 브라우저·서버 공용 클라이언트 — 내부 라우트로 일괄 변환한다. */
export async function fetchSpellings(terms: string[]): Promise<SpellingResult[]> {
  const res = await fetch("/api/translit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ terms }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "표기 변환에 실패했습니다.");
  return (json as { results?: SpellingResult[] }).results ?? [];
}
