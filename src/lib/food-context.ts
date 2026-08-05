/**
 * 식품 맥락 소프트 신호.
 *
 * ⚠️ 이건 **필터가 아니다.** 후보를 제거하지 않는다. 순위를 살짝 조정할 뿐이다.
 * 이유 — 식품 화이트리스트로 "거르면" 사전에 없는 신조어(요아정·탕후루)를 놓친다.
 * (keywordstool이 신조어를 놓친 그 함정과 같음). 그래서 여기선:
 *   - 식품어와 함께 등장한 용어 → 가점(위로)
 *   - 게임·비식품 맥락과 함께 등장한 용어(예: "Floor is Lava Challenge") → 감점(아래로)
 *   - 아무 신호 없는 용어 → 중립(원래 급증순 유지) ← 신조어가 여기 안전하게 남는다
 *
 * 제목 원문을 검사하므로, 불용어로 제거된 단어(challenge 등)도 맥락 신호로는 살아있다.
 */

// 영어는 토큰 일치(부분일치는 ice⊂nice 오탐), 한국어는 부분일치.
const FOOD_EN = new Set([
  "cake", "cakes", "chocolate", "choco", "cookie", "cookies", "candy", "dessert",
  "desserts", "bakery", "bread", "pastry", "croissant", "donut", "doughnut",
  "muffin", "brownie", "tiramisu", "pudding", "mousse", "macaron", "waffle",
  "pancake", "icecream", "gelato", "sorbet", "sundae", "snack", "snacks", "chips",
  "popcorn", "recipe", "recipes", "baking", "bake", "cooking", "cook", "food",
  "foodie", "eat", "eating", "tasty", "delicious", "yummy", "flavor", "flavour",
  "sweet", "savory", "crispy", "crunchy", "creamy", "chewy", "gooey", "fried",
  "grilled", "sauce", "cheese", "butter", "cream", "milk", "matcha", "coffee",
  "latte", "boba", "drink", "juice", "smoothie", "fruit", "mango", "strawberry",
  "caramel", "honey", "mukbang", "kitchen", "homemade", "meal", "breakfast",
  "restaurant", "cafe", "pizza", "burger", "noodle", "noodles", "ramen", "sushi",
  "kimchi", "dumpling", "bbq", "pistachio", "vanilla", "peanut",
]);
const FOOD_KO = [
  "디저트", "베이커리", "간식", "케이크", "쿠키", "초콜릿", "초코", "아이스크림",
  "음료", "커피", "라떼", "치즈", "버터", "크림", "우유", "먹방", "레시피", "요리",
  "맛집", "존맛", "꿀맛", "달콤", "매콤", "도넛", "마카롱", "크로플", "와플",
  "소금빵", "카페", "음식", "편의점", "빙수", "젤라또", "소르베", "푸딩",
  "티라미수", "스무디", "과자", "사탕", "젤리", "라면", "김밥", "만두", "요거트",
];

const NONFOOD_EN = new Set([
  "game", "games", "gaming", "gameplay", "gamer", "minecraft", "roblox",
  "fortnite", "valorant", "challenge", "prank", "unboxing", "movie", "movies",
  "trailer", "film", "song", "songs", "dance", "dancing", "workout", "gym",
  "fitness", "car", "cars", "drift", "racing", "football", "soccer", "basketball",
  "nba", "anime", "kdrama", "crypto", "bitcoin", "stock", "iphone", "lego",
  "floor", "parkour", "obstacle", "escape", "sniper", "battle", "shooter",
]);
const NONFOOD_KO = [
  "게임", "챌린지", "영화", "예고편", "노래", "커버곡", "댄스", "운동", "헬스",
  "자동차", "축구", "농구", "애니", "웹툰", "주식", "코인", "브이로그",
];

function containsFrom(lower: string, tokens: string[], enSet: Set<string>, koList: string[]): boolean {
  for (const t of tokens) if (enSet.has(t)) return true;
  for (const w of koList) if (lower.includes(w)) return true;
  return false;
}

export interface TitleContext {
  food: boolean;
  nonfood: boolean;
}

/** 제목 하나가 식품 맥락인지 / 비식품 맥락인지 (둘 다 아닐 수 있음 = 중립). */
export function contextOf(title: string): TitleContext {
  const lower = (title ?? "").toLowerCase();
  const tokens = lower.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  return {
    food: containsFrom(lower, tokens, FOOD_EN, FOOD_KO),
    nonfood: containsFrom(lower, tokens, NONFOOD_EN, NONFOOD_KO),
  };
}

export type ContextTag = "food" | "neutral" | "nonfood";

/** 가점/감점 임계값. 식품비율−비식품비율이 이보다 크면 식품, 작으면 비식품. */
const CONTEXT_THRESHOLD = 0.2;

export function contextTagOf(foodDocs: number, nonfoodDocs: number, total: number): {
  tag: ContextTag;
  foodShare: number;
  score: number;
} {
  const t = total || 1;
  const foodShare = foodDocs / t;
  const score = foodShare - nonfoodDocs / t;
  const tag: ContextTag = score >= CONTEXT_THRESHOLD ? "food" : score <= -CONTEXT_THRESHOLD ? "nonfood" : "neutral";
  return { tag, foodShare, score };
}

export const CONTEXT_RANK: Record<ContextTag, number> = { food: 2, neutral: 1, nonfood: 0 };
