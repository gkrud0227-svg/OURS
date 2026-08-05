import { NextResponse } from "next/server";
import {
  parseAutocomplete,
  pickCandidates,
  mergeCandidates,
  type AcCandidate,
} from "@/lib/naver-ac";

/**
 * 네이버 자동완성 프록시.
 *
 * 어간 시드(소금·두바이·마라 …)를 받아 각 어간의 자동완성 완성어를 수확하고,
 * 제품형 신조어 후보만 걸러 합쳐 돌려준다. 브라우저가 직접 못 부르는(CORS) ac 엔드포인트를
 * 서버에서 대신 호출한다. 공식 키가 필요 없는 공개 엔드포인트다.
 *
 *   POST { seeds: string[] } → { candidates: [{term, seed, rank}], seeds, count }
 */

const AC = "https://ac.search.naver.com/nx/ac";
/** 한 시드가 만드는 완성어를 이만큼만 본다(뒤로 갈수록 무관). */
const PER_SEED = 10;
/** 시드 폭주 방지. */
const MAX_SEEDS = 20;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Referer: "https://www.naver.com/",
  Accept: "application/json, text/plain, */*",
};

async function completionsFor(seed: string): Promise<string[]> {
  const q = encodeURIComponent(seed);
  const url = `${AC}?q=${q}&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&st=100&q_enc=UTF-8`;
  // ac 가 매달리는 경우를 대비해 8초 상한. 실패는 그 시드만 건너뛴다.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: ac.signal });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return json ? parseAutocomplete(json).slice(0, PER_SEED) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  let body: { seeds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const seeds = (Array.isArray(body.seeds) ? body.seeds : [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_SEEDS);
  if (!seeds.length) {
    return NextResponse.json({ error: "어간 시드를 하나 이상 입력하세요." }, { status: 400 });
  }

  // 시드별 자동완성을 병렬로. 개별 실패는 빈 배열로 흡수한다.
  const perSeed = await Promise.all(
    seeds.map(async (seed) => {
      const completions = await completionsFor(seed);
      return pickCandidates(seed, completions);
    }),
  );

  const candidates: AcCandidate[] = mergeCandidates(perSeed);

  // 자동완성 응답이 통째로 비면(엔드포인트 차단 등) 그 사실을 알린다 — 조용히 빈 결과보다 낫다.
  const anyRaw = perSeed.some((list) => list.length > 0);
  return NextResponse.json({
    candidates,
    seeds,
    count: candidates.length,
    ...(anyRaw ? {} : { notice: "자동완성 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요." }),
  });
}
