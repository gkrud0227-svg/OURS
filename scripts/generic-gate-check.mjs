/**
 * 총칭어 게이트 검증 — "편의점신상" 류 카테고리 총칭 복합어가 발굴 후보에서 빠지는지,
 * 그리고 제품 신조어는 그대로 살아남는지 확인한다.
 *
 *   node --experimental-strip-types scripts/generic-gate-check.mjs
 */
import { isGenericCompound, docTerms, seedTokenSet } from "../src/lib/cooccurrence.ts";
import { pickCandidates } from "../src/lib/naver-ac.ts";

let fail = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fail += 1;
};

// ── 1) 총칭 복합어는 버린다 ────────────────────────────────
for (const t of ["편의점신상", "다이소신상", "일본편의점", "쇼핑쇼츠", "쇼츠추천",
                 "아이돌간식", "카리나간식", "코스트코필수템", "신상디저트", "가성비간식"]) {
  ok(`총칭 복합어 컷: ${t}`, isGenericCompound(t));
}

// ── 2) 제품 신조어·브랜드제품은 살린다 (게이트가 신조어를 죽이면 안 된다) ──
for (const t of ["토마토크림빵", "삼립크림빵", "연세우유크림빵", "자연도소금빵",
                 "두바이초콜릿", "쫀득쿠키", "요아정", "탕후루", "밤티라미수",
                 "먹태깡", "고구마스틱", "흑임자라떼"]) {
  ok(`제품 신조어 보존: ${t}`, !isGenericCompound(t));
}

// ── 3) 단독 총칭어는 이 게이트가 아니라 기존 불용어가 처리한다 (이중처리 방지) ──
ok("단독 총칭어는 게이트 대상 아님: 간식", !isGenericCompound("간식"));
ok("단독 총칭어는 게이트 대상 아님: 편의점", !isGenericCompound("편의점"));
ok("단독 총칭어는 게이트 대상 아님: 쇼츠", !isGenericCompound("쇼츠"));
// 1자 성분(빵)도 뒤에 붙어 총칭 복합어를 만든다
ok("1자 성분 결합 컷: 간식빵", isGenericCompound("간식빵"));
ok("1자 성분 결합 컷: 디저트빵", isGenericCompound("디저트빵"));
ok("1자 성분이 제품명을 깨지 않음: 소금빵", !isGenericCompound("소금빵"));
ok("1자 성분이 제품명을 깨지 않음: 마늘빵", !isGenericCompound("마늘빵"));

// ── 4) 실제 제목에서의 추출 (유튜브 발굴 경로) ─────────────
const seedTokens = seedTokenSet("신상 디저트");
const terms = docTerms(
  "#편의점신상 #쇼핑쇼츠 멋쟁이 토마토 크림빵 손을 뻗었다 #아이돌간식",
  seedTokens,
  { hashtags: true },
);
ok("제목 추출: 편의점신상 제외", !terms.has("편의점신상"));
ok("제목 추출: 쇼핑쇼츠 제외", !terms.has("쇼핑쇼츠"));
ok("제목 추출: 아이돌간식 제외", !terms.has("아이돌간식"));
ok("제목 추출: 1자어간+조사 조각(손을) 제외", !terms.has("손을"));
ok("제목 추출: 멋쟁이 어간 보존(멋쟁 아님)", terms.has("멋쟁이") && !terms.has("멋쟁"));
ok("제목 추출: 제품어(크림빵) 보존", terms.has("크림빵"));

// ── 4b) 조사 제거가 복합 식품명을 부수지 않는가 ─────────────
const food = docTerms("무화과 크레페 군위사과 신상 즐길 수 있는 견과 쿠키", seedTokens);
ok("조사 과: 무화과 보존(무화 아님)", food.has("무화과") && !food.has("무화"));
ok("조사 과: 군위사과 보존(군위사 아님)", food.has("군위사과") && !food.has("군위사"));
ok("조사 과: 견과 보존", food.has("견과"));
ok("관형형 조각(즐길) 제외", !food.has("즐길"));

// ── 5) 자동완성 경로에도 같은 게이트 ───────────────────────
const ac = pickCandidates("간식", [
  "편의점 신상", "아이돌 간식", "쇼핑쇼츠 부업", "김부장 등장인물",
  "복숭아 보관법", "두바이 쫀득쿠키", "연세 토마토크림빵",
]).map((c) => c.term);
ok("자동완성: 총칭 완성어 제외", !ac.includes("편의점 신상") && !ac.includes("아이돌 간식"));
ok("자동완성: 부업·등장인물·보관법 제외",
   !ac.includes("쇼핑쇼츠 부업") && !ac.includes("김부장 등장인물") && !ac.includes("복숭아 보관법"));
ok("자동완성: 제품 완성어 보존",
   ac.includes("두바이 쫀득쿠키") && ac.includes("연세 토마토크림빵"));

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
