/**
 * YouTube의 `relevanceLanguage`는 강제가 아니라 선호도라, 해외 검색에도
 * 스페인어·인도네시아어·한국어 영상이 섞여 들어온다.
 * 이유 태그·동반 키워드가 오염되므로 문서 단위로 언어를 걸러낸다.
 *
 * ⚠️ "영어 기능어 N개 이상"을 요구하면 `Dubai Chocolate ASMR` 같은
 *    짧은 영어 제목이 통째로 탈락한다. 그래서 **명백한 타언어만 배제**한다.
 */

export type DocLocale = "ko" | "en" | "zh";

const EN_FUNCTION_WORDS = [
  "the", "and", "of", "to", "is", "it", "this", "with", "for", "you",
  "that", "in", "on", "are", "was", "my", "we", "have", "how",
];

/** 스페인어·포르투갈어·인도네시아어 등에서 흔한 기능어 */
const NON_EN_FUNCTION_WORDS = [
  // es / pt
  "que", "de", "la", "el", "los", "las", "con", "para", "por", "una",
  "del", "como", "pero", "muy", "sin", "mas", "eso", "esta", "nao", "voce",
  // id / ms
  "yang", "dan", "dengan", "ini", "itu", "tidak", "saya", "dari", "untuk",
  "adalah", "ada", "bisa", "akan", "kita", "juga",
  // hi / ur (로마자 표기) — 인도 영어권 콘텐츠가 US 검색을 뒤덮는다. 실측(US "viral food")에서
  // 상위 후보가 janmashtami·banaye·roti·onam 로 채워졌다. 영어 기능어 검사로는 안 걸린다.
  // ⚠️ 영어 단어와 겹치는 것(par·se·main)은 넣지 않는다.
  "hai", "aur", "mein", "kya", "nahi", "kaise", "banaye", "banane", "banaya",
  "wala", "wali", "bhi", "liye", "karne", "karo", "ghar", "desi", "yeh", "koi",
];

const CJK_RE = /[가-힣ぁ-んァ-ヶ一-鿿]/g;
/**
 * 라틴 문자가 아닌 **표기 체계**. 한 글자만 있어도 영어 문서로 보지 않는다.
 *
 * relevanceLanguage=en · regionCode=US 로 검색해도 남아시아·태국권 콘텐츠가 대량으로 섞인다
 * (실측: 상위 후보가 janmashtami·paratha·biryani·odia 로 채워짐). 그쪽 제목은 영어 해시태그를
 * 달되 본문에 고유 문자가 남는 경우가 많아, 문자 종류로 거르는 편이 기능어 검사보다 정확하다.
 * ⚠️ 이모지는 문자 범위 밖이라 영향받지 않는다.
 */
const NON_LATIN_SCRIPT_RE = new RegExp(
  "[" +
    "\u0900-\u097F" + // 데바나가리 (힌디·마라티)
    "\u0980-\u09FF" + // 벵골어
    "\u0A00-\u0A7F" + // 구르무키 (펀자브)
    "\u0A80-\u0AFF" + // 구자라트어
    "\u0B00-\u0B7F" + // 오리야어
    "\u0B80-\u0BFF" + // 타밀어
    "\u0C00-\u0C7F" + // 텔루구어
    "\u0C80-\u0CFF" + // 칸나다어
    "\u0D00-\u0D7F" + // 말라얄람어
    "\u0E00-\u0E7F" + // 태국어
    "\u0600-\u06FF" + // 아랍어
    "\u0400-\u04FF" + // 키릴 문자
    "]",
);
/** 이 개수를 넘는 CJK 문자가 있으면 영어 문서로 보지 않는다. */
const CJK_LIMIT = 5;

const HANGUL_RE = /[가-힣]/;
const KANA_RE = /[ぁ-んァ-ヶ]/;
const HANZI_RE = /[一-鿿]/g;
/** 한자가 이 개수 이상이어야 중국어 문서로 본다. */
const HANZI_MIN = 4;

function countWords(haystack: string, words: string[]): number {
  let n = 0;
  for (const w of words) if (haystack.includes(` ${w} `)) n += 1;
  return n;
}

function normalize(text: string): string {
  return ` ${(text ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
}

export function isEnglishish(text: string): boolean {
  const raw = text ?? "";
  const cjk = raw.match(CJK_RE);
  if (cjk && cjk.length > CJK_LIMIT) return false;
  if (NON_LATIN_SCRIPT_RE.test(raw)) return false;

  const t = normalize(raw);
  const en = countWords(t, EN_FUNCTION_WORDS);
  const other = countWords(t, NON_EN_FUNCTION_WORDS);

  // 타언어 기능어가 2개 이상이고 영어보다 많으면 배제
  return !(other >= 2 && other > en);
}

export function isKoreanish(text: string): boolean {
  return HANGUL_RE.test(text ?? "");
}

/**
 * 중국어(간체·번체) 문서 판별.
 * 한글이 섞였거나 일본어 가나가 있으면 배제한다 — 일본어는 한자를 공유하므로
 * 가나 유무가 사실상 유일하게 값싼 구분점이다.
 */
export function isChineseish(text: string): boolean {
  const raw = text ?? "";
  if (HANGUL_RE.test(raw)) return false;
  if (KANA_RE.test(raw)) return false;
  const hanzi = raw.match(HANZI_RE);
  return Boolean(hanzi && hanzi.length >= HANZI_MIN);
}

export function localePredicate(locale: DocLocale): (text: string) => boolean {
  if (locale === "ko") return isKoreanish;
  if (locale === "zh") return isChineseish;
  return isEnglishish;
}

/** 국가 코드 → 텍스트 분석 로케일. */
export function localeForRegion(region: string): DocLocale {
  const r = (region ?? "").toUpperCase();
  if (r === "KR") return "ko";
  if (r === "CN" || r === "TW" || r === "HK") return "zh";
  return "en";
}

/**
 * 로케일에 맞는 문서만 남긴다.
 * 남는 문서가 너무 적으면(5건 미만) 표본 붕괴를 막기 위해 원본을 그대로 쓴다.
 */
export function filterDocsByLocale(docs: string[], locale: DocLocale): string[] {
  const keep = docs.filter(localePredicate(locale));
  return keep.length >= 5 ? keep : docs;
}
