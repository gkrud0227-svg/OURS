import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * LLM 트렌드 레이더 — 음식 매체 기사/뉴스레터 텍스트에서 **명명된 부상 트렌드**를 뽑는다.
 *
 * 왜 필요한가: fricy(과일+향신료) 같은 트렌드는 매체가 먼저 이름 붙이고, 대중 콘텐츠·검색이
 * 터지기 전이라 유튜브/검색 발굴로는 원리상 늦다. 자동완성도 과거 스냅샷이 없어 백테스트 불가.
 * 그래서 매체가 이름 붙이는 순간을 **텍스트에서** 포착해 시드/워치로 흘려보내고, 전향적 로그로
 * 실제 히트 여부를 look-ahead 편향 없이 추적한다.
 *
 * 키가 없으면 { trends: [], needsKey: true } 로 조용히 폴백한다.
 */

interface RadarTrend {
  name: string;
  aliases: string[];
  keywords: string[];
  category: string;
  region: string;
  platform: string;
  rationale: string;
  confidence: number;
}

/** 같은 기사 반복 추출을 막는 프로세스 캐시 (텍스트 앞부분 → 결과). */
const cache = new Map<string, RadarTrend[]>();
const cacheKey = (t: string) => t.slice(0, 200) + "|" + t.length;

const SYSTEM = [
  "너는 식품 트렌드 애널리스트다. 음식 매체 기사/뉴스레터 본문에서 **명명된(이름이 붙은) 부상 음식 트렌드**를 뽑는다.",
  "출력은 오직 JSON 하나. 설명·마크다운·코드펜스 금지. 스키마:",
  '{"trends":[{"name":string,"aliases":string[],"keywords":string[],"category":string,"region":string,"platform":string,"rationale":string,"confidence":number}]}',
  "- name: 트렌드의 명칭(예: fricy). 기사에 명시된 이름을 그대로.",
  "- aliases: 다른 표기/한글표기(예: 프리시).",
  "- keywords: 이 트렌드를 추적할 **구체 검색어**(제품·음료·해시태그). 예: mangonada, spicy fruit, chamoy, 매콤한 과일. 시드로 바로 쓸 5~10개.",
  "- category: dessert/snack/drink/sauce 등 대분류.",
  "- region: 어디서 뜨는지(US, Global, Mexico 등).",
  "- platform: 어디서 뜨는지(TikTok, Instagram, editorial 등).",
  "- rationale: 왜 트렌드인지 한 줄.",
  "- confidence: 0~1. 기사가 '차세대 트렌드로 지목' 정도면 0.5~0.7, 이미 폭발이면 0.8+.",
  "음식과 무관한 것은 넣지 않는다. 명명된 트렌드가 없으면 trends: [].",
].join("\n");

export async function POST(request: Request) {
  let text = "";
  try {
    text = String(((await request.json()) as { text?: string }).text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  if (text.length < 40) {
    return NextResponse.json({ error: "기사 본문이 너무 짧습니다." }, { status: 400 });
  }

  const key = cacheKey(text);
  if (cache.has(key)) {
    return NextResponse.json({ trends: cache.get(key), source: "cache" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ trends: [], needsKey: true });
  }

  const model = process.env.RADAR_LLM_MODEL || "claude-opus-5";

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      // 기사 본문이 길 수 있어 앞 12,000자만 — 트렌드 명명은 보통 도입부·본문에 있다.
      messages: [{ role: "user", content: text.slice(0, 12000) }],
    });

    const raw = res.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    // 혹시 코드펜스로 감싸도 안전하게 JSON 부분만 추출.
    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = json.indexOf("{");
    const end = json.lastIndexOf("}");
    if (start < 0 || end < 0) {
      return NextResponse.json(
        { error: "LLM 응답을 해석할 수 없습니다.", detail: raw.slice(0, 200) },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(json.slice(start, end + 1)) as { trends?: unknown };
    const trends: RadarTrend[] = Array.isArray(parsed.trends)
      ? (parsed.trends as RadarTrend[])
          .filter((t) => t && typeof t.name === "string" && t.name.trim())
          .map((t) => ({
            name: String(t.name).trim(),
            aliases: Array.isArray(t.aliases) ? t.aliases.map(String).filter(Boolean) : [],
            keywords: Array.isArray(t.keywords) ? t.keywords.map(String).filter(Boolean) : [],
            category: typeof t.category === "string" ? t.category : "",
            region: typeof t.region === "string" ? t.region : "",
            platform: typeof t.platform === "string" ? t.platform : "",
            rationale: typeof t.rationale === "string" ? t.rationale : "",
            confidence:
              typeof t.confidence === "number" ? Math.max(0, Math.min(1, t.confidence)) : 0.5,
          }))
      : [];

    cache.set(key, trends);
    return NextResponse.json({ trends, source: "llm", model });
  } catch (e) {
    return NextResponse.json(
      { error: "트렌드 추출에 실패했습니다.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
