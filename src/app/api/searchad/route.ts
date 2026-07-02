import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { isNoiseKeyword } from "@/lib/keyword-filter";

const BASE = "https://api.searchad.naver.com";
const PATH = "/keywordstool";

interface KeywordToolItem {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
}

/** "< 10" 같은 문자열도 안전하게 숫자로. */
function toNum(v: number | string | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sign(timestamp: string, method: string, path: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest("base64");
}

export async function POST(request: Request) {
  const apiKey = process.env.NAVER_AD_API_KEY;
  const secret = process.env.NAVER_AD_SECRET_KEY;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;

  if (!apiKey || !secret || !customerId) {
    return NextResponse.json(
      {
        error:
          "네이버 검색광고 API가 설정되지 않았습니다. .env.local에 NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID를 추가하세요. (발급 방법은 README 참고)",
      },
      { status: 400 },
    );
  }

  let body: { seeds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const seeds = (body.seeds ?? [])
    .map((s) => (typeof s === "string" ? s.trim().replace(/\s+/g, "") : ""))
    .filter(Boolean);
  if (!seeds.length) {
    return NextResponse.json({ error: "시드 키워드가 없습니다." }, { status: 400 });
  }

  // keywordstool은 요청당 hintKeywords 최대 5개.
  const chunks: string[][] = [];
  for (let i = 0; i < seeds.length; i += 5) chunks.push(seeds.slice(i, i + 5));

  const merged = new Map<
    string,
    { name: string; volumePc: number; volumeMobile: number; volumeTotal: number; compIdx?: string }
  >();

  try {
    for (const chunk of chunks) {
      const timestamp = Date.now().toString();
      const signature = sign(timestamp, "GET", PATH, secret);
      const query = new URLSearchParams({
        hintKeywords: chunk.join(","),
        showDetail: "1",
      });
      const res = await fetch(`${BASE}${PATH}?${query}`, {
        method: "GET",
        headers: {
          "X-Timestamp": timestamp,
          "X-API-KEY": apiKey,
          "X-Customer": customerId,
          "X-Signature": signature,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json(
          {
            error: `검색광고 API 오류 (HTTP ${res.status}). API 라이선스·비밀키·고객 ID를 확인하세요.`,
            detail: detail.slice(0, 400),
          },
          { status: 502 },
        );
      }

      const json = (await res.json()) as { keywordList?: KeywordToolItem[] };
      for (const item of json.keywordList ?? []) {
        const name = (item.relKeyword ?? "").trim();
        if (!name) continue;
        const volumePc = toNum(item.monthlyPcQcCnt);
        const volumeMobile = toNum(item.monthlyMobileQcCnt);
        const volumeTotal = volumePc + volumeMobile;
        const prev = merged.get(name);
        if (!prev || volumeTotal > prev.volumeTotal) {
          merged.set(name, {
            name,
            volumePc,
            volumeMobile,
            volumeTotal,
            compIdx: item.compIdx,
          });
        }
      }
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "검색광고 서버에 연결하지 못했습니다.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  const candidates = Array.from(merged.values())
    .filter((c) => !isNoiseKeyword(c.name)) // 장소·여행·맛집·명절 등 비관련 제외
    .sort((a, b) => b.volumeTotal - a.volumeTotal)
    .slice(0, 150);

  return NextResponse.json({ seeds, candidates });
}
