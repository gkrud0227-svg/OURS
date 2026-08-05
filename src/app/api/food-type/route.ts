import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * 트렌드 키워드 → 식품안전나라 공식 품목유형(PRDLST_DCNM) 매핑.
 *
 * 사전(lib/odm.ts guessFoodType)이 놓친 신조어를 LLM으로 분류한다. 사전이 우선이고
 * 여기는 폴백이라, 대부분의 발굴 키워드는 이 라우트를 타지 않는다.
 *
 * ⚠️ 실제 품목제조보고의 분류명은 "과자류"가 아니라 "과자", "초콜릿류"가 아니라
 *    "초콜릿가공품"이다. 그래서 LLM 에 실제 어휘 목록을 주고 그 안에서 고르게 한다.
 *
 * 키가 없으면 { type: null } 을 돌려주고, 화면은 사용자가 직접 고르는 흐름으로 폴백한다.
 */

/** 식품안전나라 I1250 에서 실제로 쓰이는 대표 품목유형(식품 완제품 위주, 첨가물·색소 제외). */
const FOOD_TYPES = [
  "과자",
  "캔디류",
  "빵류",
  "떡류",
  "초콜릿가공품",
  "잼류",
  "커피",
  "다류",
  "액상차",
  "고형차",
  "탄산음료",
  "혼합음료",
  "과·채음료",
  "과·채주스",
  "유산균음료",
  "인삼·홍삼음료",
  "음료베이스",
  "아이스크림류",
  "빙과류",
  "가공유류",
  "발효유류",
  "식물성크림",
  "생면",
  "숙면",
  "유탕면",
  "곡류가공품",
  "두류가공품",
  "서류가공품",
  "전분가공품",
  "과·채가공품",
  "즉석섭취식품",
  "즉석조리식품",
  "신선편의식품",
  "소스",
  "마요네즈",
  "토마토케첩",
  "복합조미식품",
  "당류가공품",
  "올리고당",
  "식육함유가공품",
  "어육소시지",
  "양념젓갈",
];

/** 반복 호출 방지용 프로세스 캐시 (키워드 → 품목유형). */
const cache = new Map<string, string | null>();

export async function POST(request: Request) {
  let term = "";
  try {
    term = String(((await request.json()) as { term?: string }).term ?? "").trim();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  if (!term) return NextResponse.json({ error: "term 이 없습니다." }, { status: 400 });

  if (cache.has(term)) {
    return NextResponse.json({ type: cache.get(term), source: "cache" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 키가 없으면 조용히 폴백 — 화면에서 사용자가 유형을 직접 고른다.
    return NextResponse.json({ type: null, needsKey: true });
  }

  // 분류 작업이라 저비용 모델로 충분하다. 기본은 가이드에 따라 opus지만,
  // FOODTYPE_LLM_MODEL 로 claude-haiku-4-5(약 5배 저렴) 등으로 바꿀 수 있다.
  const model = process.env.FOODTYPE_LLM_MODEL || "claude-opus-5";

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 64,
      system:
        "너는 한국 식품 트렌드 키워드를 식품안전나라 공식 품목유형(PRDLST_DCNM)에 매핑한다. " +
        "반드시 주어진 목록 중 하나만 정확히 그대로 출력하거나, 적절한 게 없으면 NONE 만 출력한다. " +
        "설명·따옴표·기타 텍스트 금지. 예: '두바이초콜릿' → 초콜릿가공품, '탕후루' → 캔디류, '요아정' → 발효유류.",
      messages: [
        {
          role: "user",
          content: `품목유형 목록:\n${FOOD_TYPES.join(", ")}\n\n키워드: ${term}\n\n품목유형:`,
        },
      ],
    });

    const text = res.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    // 목록에 있는 값만 신뢰한다. (모델이 임의 문자열을 내면 버린다)
    const type = FOOD_TYPES.includes(text) ? text : null;
    cache.set(term, type);
    return NextResponse.json({ type, source: "llm", model });
  } catch (e) {
    // LLM 실패도 폴백 — 화면이 멈추지 않게 한다.
    return NextResponse.json(
      { type: null, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
