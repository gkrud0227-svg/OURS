import crypto from "node:crypto";
import { isNoiseKeyword } from "./keyword-filter";

/**
 * 네이버 검색광고 keywordstool 호출 공용 모듈.
 * 발굴(/api/searchad)과 발굴 커버리지(/api/coverage)가 **동일한 파이프라인**을
 * 쓰도록 하나로 뺐다. (커버리지가 실제 발굴과 다른 결과를 내면 검정 의미가 없다)
 *
 * 서버 전용 — process.env와 crypto를 쓰므로 클라이언트에서 import 금지.
 */

const BASE = "https://api.searchad.naver.com";
const PATH = "/keywordstool";

export interface RawCandidate {
  name: string;
  volumePc: number;
  volumeMobile: number;
  volumeTotal: number;
  compIdx?: string;
}

interface KeywordToolItem {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
}

export class KeywordstoolError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "KeywordstoolError";
    this.status = status;
    this.detail = detail;
  }
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

/**
 * 시드로 연관 키워드 후보를 받아 **노이즈 제거 + 검색량 내림차순** 정렬해 반환.
 * (상위 N 슬라이스는 호출부에서 — 커버리지는 전체 순위가 필요하다)
 */
export async function fetchKeywordstool(seeds: string[]): Promise<RawCandidate[]> {
  const apiKey = process.env.NAVER_AD_API_KEY;
  const secret = process.env.NAVER_AD_SECRET_KEY;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;

  if (!apiKey || !secret || !customerId) {
    throw new KeywordstoolError(
      "네이버 검색광고 API가 설정되지 않았습니다. .env.local에 NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID를 추가하세요.",
      400,
    );
  }

  const clean = seeds
    .map((s) => (typeof s === "string" ? s.trim().replace(/\s+/g, "") : ""))
    .filter(Boolean);
  if (!clean.length) {
    throw new KeywordstoolError("시드 키워드가 없습니다.", 400);
  }

  // keywordstool은 요청당 hintKeywords 최대 5개.
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += 5) chunks.push(clean.slice(i, i + 5));

  const merged = new Map<string, RawCandidate>();

  for (const chunk of chunks) {
    const timestamp = Date.now().toString();
    const signature = sign(timestamp, "GET", PATH, secret);
    const query = new URLSearchParams({ hintKeywords: chunk.join(","), showDetail: "1" });
    let res: Response;
    try {
      res = await fetch(`${BASE}${PATH}?${query}`, {
        method: "GET",
        headers: {
          "X-Timestamp": timestamp,
          "X-API-KEY": apiKey,
          "X-Customer": customerId,
          "X-Signature": signature,
        },
        cache: "no-store",
      });
    } catch (e) {
      throw new KeywordstoolError(
        "검색광고 서버에 연결하지 못했습니다.",
        502,
        e instanceof Error ? e.message : String(e),
      );
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new KeywordstoolError(
        `검색광고 API 오류 (HTTP ${res.status}). API 라이선스·비밀키·고객 ID를 확인하세요.`,
        502,
        detail.slice(0, 400),
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
        merged.set(name, { name, volumePc, volumeMobile, volumeTotal, compIdx: item.compIdx });
      }
    }
  }

  return Array.from(merged.values())
    .filter((c) => !isNoiseKeyword(c.name)) // 장소·여행·맛집·명절 등 비관련 제외
    .sort((a, b) => b.volumeTotal - a.volumeTotal);
}
