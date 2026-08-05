import type { ReasonCategory, ReasonResult } from "./types";

/** 주요 확산 이유로 인정하기 위한 최소 "언급 문서(영상) 수". */
export const MIN_DOC_HITS = 3;

/**
 * "이유 카테고리 사전" — 확산 이유를 추정하기 위한 단어 사전.
 * 활용형(바삭한/바삭하게)을 잡기 위해 **어간(부분일치)** 형태로 등록한다.
 *
 * ⚠️ 짧고 흔한 토큰은 오탐을 일으키므로 넣지 말 것.
 *    예) "봄" → 먹어봄/해봄/맛봄 오탐, "힙" → 힙합 오탐
 */
export const REASON_DICT: { key: string; label: string; words: string[] }[] = [
  {
    key: "taste",
    label: "맛 궁합",
    words: [
      "고소", "달콤", "달달", "짭짤", "짭조름", "단짠", "새콤", "꿀조합",
      "꿀맛", "존맛", "맛있", "어울리", "밸런스",
    ],
  },
  {
    key: "texture",
    label: "식감",
    words: [
      "바삭", "겉바속촉", "쫀득", "쫄깃", "촉촉", "부드럽", "크리미",
      "꾸덕", "말랑", "폭신", "찐득",
    ],
  },
  {
    key: "season",
    label: "계절 연상",
    words: [
      "여름", "한여름", "여름철", "겨울", "겨울철", "봄철", "가을철", "가을",
      "시원", "따끈", "따뜻한", "더위", "무더위", "폭염", "제철", "삼복", "복날",
    ],
  },
  {
    key: "visual",
    label: "비주얼·인증샷",
    words: [
      "예쁘", "비주얼", "색감", "인증샷", "인생샷", "감성", "플레이팅",
      "존예", "때깔", "힙한",
    ],
  },
  {
    key: "scarcity",
    label: "희소성",
    words: [
      "품절", "한정", "대란", "오픈런", "웨이팅", "줄서", "못구",
      "없어서못", "완판", "리셀",
    ],
  },
];

/**
 * 영문 사전 (해외 코퍼스: Reddit 본문 · YouTube 영문 제목·설명).
 * ⚠️ 부분일치이므로 "crispy"/"crisp"처럼 겹치는 어간은 하나만 등록한다.
 */
export const REASON_DICT_EN: { key: string; label: string; words: string[] }[] = [
  {
    key: "taste",
    label: "맛 궁합",
    words: [
      "savory", "sweet", "salty", "umami", "buttery", "nutty", "rich",
      "delicious", "tasty", "yummy", "flavor", "flavour", "balance", "pairing",
    ],
  },
  {
    key: "texture",
    label: "식감",
    words: [
      "crisp", "crunch", "chewy", "flaky", "fluffy", "moist", "creamy",
      "gooey", "tender", "airy", "melt",
    ],
  },
  {
    key: "season",
    label: "계절 연상",
    words: [
      "summer", "winter", "spring", "autumn", "refresh", "chilled", "cozy",
      "seasonal", "icy", "warm", "heatwave",
    ],
  },
  {
    key: "visual",
    label: "비주얼·인증샷",
    words: [
      "aesthetic", "instagram", "photogenic", "gorgeous", "beautiful",
      "pretty", "stunning", "plating", "presentation",
    ],
  },
  {
    key: "scarcity",
    label: "희소성",
    words: [
      "sold out", "limited", "viral", "hype", "queue", "waitlist",
      "exclusive", "restock", "lining up",
    ],
  },
];

/**
 * 중국어 사전 (간체·번체 병기 — 대만·홍콩 콘텐츠가 상당수 섞인다).
 * 중국어는 띄어쓰기가 없어 부분일치가 오히려 자연스럽게 동작한다.
 * ⚠️ 1자 단어(香/甜)는 오탐이 커서 넣지 않는다.
 */
export const REASON_DICT_ZH: { key: string; label: string; words: string[] }[] = [
  {
    key: "taste",
    label: "맛 궁합",
    words: [
      "好吃", "美味", "香甜", "香浓", "香濃", "浓郁", "濃郁", "奶香",
      "甜咸", "甜鹹", "爆汁", "搭配", "绝配", "絕配", "回甘",
    ],
  },
  {
    key: "texture",
    label: "식감",
    words: [
      "酥脆", "香脆", "软糯", "軟糯", "绵密", "綿密", "顺滑", "順滑",
      "弹牙", "彈牙", "爆浆", "爆漿", "拉丝", "拉絲", "湿润", "濕潤", "松软", "鬆軟",
    ],
  },
  {
    key: "season",
    label: "계절 연상",
    words: [
      "夏天", "夏日", "冬天", "冬日", "春天", "秋天", "解暑", "消暑",
      "清凉", "清涼", "冰镇", "冰鎮", "温暖", "溫暖", "应季", "應季",
    ],
  },
  {
    key: "visual",
    label: "비주얼·인증샷",
    words: [
      "颜值", "顏值", "好看", "出片", "摆盘", "擺盤", "治愈", "治癒",
      "氛围感", "氛圍感", "少女心", "高级感", "高級感",
    ],
  },
  {
    key: "scarcity",
    label: "희소성",
    words: [
      "限定", "限量", "售罄", "断货", "斷貨", "排队", "排隊", "抢购", "搶購",
      "联名", "聯名", "爆火", "刷屏", "秒杀", "秒殺", "一位难求", "一位難求",
    ],
  },
];

export type ReasonLocale = "ko" | "en" | "zh";

function dictFor(locale: ReasonLocale) {
  if (locale === "en") return REASON_DICT_EN;
  if (locale === "zh") return REASON_DICT_ZH;
  return REASON_DICT;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * 텍스트 묶음에서 이유 카테고리별 언급 빈도를 계산한다.
 * 비중(share)은 **언급한 문서 비율**(docHits / docCount) 기준 — 한 문서에서
 * 여러 번 반복돼도 1건으로 세어 왜곡을 막는다.
 */
export function analyzeReasons(
  texts: string[],
  locale: ReasonLocale = "ko",
): ReasonResult {
  const docs = texts.map((t) => (t ?? "").toLowerCase());
  const docCount = docs.length;

  const categories: ReasonCategory[] = dictFor(locale).map((cat) => {
    let matches = 0;
    let docHits = 0;
    const wordCounts: Record<string, number> = {};
    for (const doc of docs) {
      let inDoc = false;
      for (const w of cat.words) {
        const c = countOccurrences(doc, w.toLowerCase());
        if (c > 0) {
          matches += c;
          wordCounts[w] = (wordCounts[w] ?? 0) + c;
          inDoc = true;
        }
      }
      if (inDoc) docHits += 1;
    }
    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);
    return {
      key: cat.key,
      label: cat.label,
      matches,
      docHits,
      topWords,
      share: docCount ? docHits / docCount : 0,
    };
  });

  categories.sort((a, b) => b.docHits - a.docHits || b.matches - a.matches);

  const totalMatches = categories.reduce((a, c) => a + c.matches, 0);
  const top = categories[0];
  const confident = Boolean(top && top.docHits >= MIN_DOC_HITS);

  return {
    docCount,
    totalMatches,
    confident,
    dominant: confident ? top.label : null,
    categories,
  };
}
