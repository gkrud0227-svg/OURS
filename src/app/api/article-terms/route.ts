import { NextResponse } from "next/server";
import { docTerms } from "@/lib/cooccurrence";
import { contextOf } from "@/lib/food-context";

/**
 * 무료 기사 키워드 추출 — LLM 없이, 우리 발굴 엔진의 term 추출(docTerms: 불용어·어미규칙·
 * 식품맥락)을 해외 음식 기사에 그대로 돌린다.
 *
 * 왜: fricy 같은 매체-명명 트렌드는 유튜브 데이터엔 이름이 없지만 **기사 본문엔 있다**.
 * "프리시(fricy)", "mangonada", "#fricy" 가 텍스트에 등장하므로 그대로 뽑을 수 있다.
 * LLM처럼 "이게 트렌드다"라고 판단하진 못하지만, 후보 단어를 사람이 보고 시드에 넣게 한다.
 *
 * URL을 주면 서버가 가져와 태그를 벗겨 본문만 남긴다. 실패하면 텍스트 붙여넣기로 폴백.
 */

/** HTML 태그·스크립트 제거 후 본문 텍스트만. 완벽한 파서는 아니고 추출용 근사. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

interface TermHit {
  term: string;
  count: number;
  food: boolean;
}

export async function POST(request: Request) {
  let body: { url?: string; text?: string };
  try {
    body = (await request.json()) as { url?: string; text?: string };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  let text = (body.text ?? "").trim();
  const url = (body.url ?? "").trim();

  // URL이 있으면 서버가 가져와 본문 추출 (텍스트가 이미 있으면 텍스트 우선).
  if (!text && url) {
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "http(s) URL 을 넣어주세요." }, { status: 400 });
    }
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15_000);
      let html: string;
      try {
        const res = await fetch(url, {
          signal: ac.signal,
          headers: { "User-Agent": "Mozilla/5.0 (trend-dashboard article fetch)" },
          cache: "no-store",
        });
        if (!res.ok) {
          return NextResponse.json(
            { error: `기사를 가져오지 못했습니다 (HTTP ${res.status}). 본문을 직접 붙여넣어 주세요.` },
            { status: 502 },
          );
        }
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }
      text = htmlToText(html);
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return NextResponse.json(
        {
          error: aborted
            ? "기사 요청이 15초를 넘겼습니다. 본문을 직접 붙여넣어 주세요."
            : "기사 URL에 연결하지 못했습니다. 사이트가 봇을 막을 수 있어요 — 본문을 직접 붙여넣어 주세요.",
        },
        { status: 502 },
      );
    }
  }

  if (text.length < 12) {
    return NextResponse.json({ error: "기사 본문이 너무 짧습니다." }, { status: 400 });
  }

  // 문장 단위로 docTerms를 돌려 "몇 문장에 등장했나"를 salience 근사로 센다.
  const empty = new Set<string>();
  const freq = new Map<string, number>();
  const foodFlag = new Map<string, boolean>();
  const sentences = text.slice(0, 20000).split(/[\n.!?。！？]+/);
  for (const s of sentences) {
    const cx = contextOf(s);
    for (const term of docTerms(s, empty, { hashtags: true })) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
      // 그 term이 나온 문장이 식품맥락이면 식품어로 표시(랭킹 가점).
      if (cx.food && !foodFlag.get(term)) foodFlag.set(term, true);
    }
  }

  const hits: TermHit[] = [...freq.entries()]
    .map(([term, count]) => ({ term, count, food: foodFlag.get(term) ?? false }))
    // 기사 산문 bigram("일부 음식")은 제품명이 아니라 노이즈 — 단일 토큰·해시태그만 남긴다.
    .filter((h) => !h.term.includes(" "))
    // 식품맥락 or 2회 이상만.
    .filter((h) => h.food || h.count >= 2)
    // 식품맥락 우선, 그다음 등장 빈도.
    .sort((a, b) => Number(b.food) - Number(a.food) || b.count - a.count)
    .slice(0, 40);

  return NextResponse.json({ terms: hits });
}
