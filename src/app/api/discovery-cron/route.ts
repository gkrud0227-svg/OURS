import { NextResponse } from "next/server";
import { SEED_PRESETS } from "@/lib/global";
import { appendLog, type LogCandidate } from "@/lib/discovery-log-store";

/**
 * 발굴 자동화 크론 — 전향적 로그를 자동으로 키운다.
 *
 * 브라우저 없이 서버에서 기존 발굴 파이프라인을 재사용한다:
 *   1) YouTube 발굴(KR + 해외 US·GB)  ← /api/global/discover
 *   2) 국내 발굴어로 네이버 자동완성 확장(source=search)  ← /api/naver-ac
 *   3) 최초 등장 후보만 discovery_log 에 append
 *
 * ⚠️ YouTube API 쿼터를 쓴다(1회 약 9000 units, 기본 하루 10,000). 하루 1회 권장.
 * ⚠️ 시드는 **기본 프리셋**을 쓴다(사용자가 UI에서 바꾼 시드는 localStorage 라 서버가 모름).
 * ℹ️ 검증(데이터랩·쇼핑 등) 없이 발굴 신호만 로깅한다 — 라벨링은 나중에 데이터랩으로 별도 수행.
 *
 * 보호: CRON_SECRET 이 설정돼 있으면 `Authorization: Bearer <CRON_SECRET>` 를 요구한다.
 *       (Vercel 크론은 이 헤더를 자동으로 붙인다.)
 */

const OVERSEAS_REGIONS = ["US", "GB"]; // store-context 의 OVERSEAS_REGIONS 와 동일(클라 모듈 import 회피)

// 발굴은 오래 걸린다 — 함수 최대 실행시간을 늘린다(Vercel Pro 기준 상한).
export const maxDuration = 60; // Hobby 플랜 상한(60초). Pro면 300까지 가능.

interface DiscoverResp {
  candidates?: Array<{
    term: string;
    novel?: boolean;
    lift?: number;
    dfRecent?: number;
    contextTag?: string;
  }>;
}

async function discover(base: string, seeds: string[], region: string): Promise<LogCandidate[]> {
  const res = await fetch(`${base}/api/global/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds, region }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as DiscoverResp;
  return (json.candidates ?? []).map((c) => ({
    term: c.term,
    source: "youtube",
    novel: c.novel,
    lift: c.lift ?? null,
    dfRecent: c.dfRecent ?? null,
    contextTag: c.contextTag ?? null,
  }));
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = new URL(request.url).origin;
  const at = new Date().toISOString();
  const errors: string[] = [];
  const done: string[] = [];
  let added = 0;

  // 단계별로 즉시 로그에 저장한다 — Hobby 60초에 끊겨도 완료 단계는 유지되고, 외부 스케줄러
  // 재시도가 나머지를 이어받는다(최초 등장 dedup이라 중복 저장 없음).
  async function flush(batch: LogCandidate[], label: string) {
    if (!batch.length) return;
    try {
      const r = await appendLog(batch, at);
      added += r.added;
      done.push(`${label}:+${r.added}`);
    } catch {
      errors.push(`append:${label}`);
    }
  }

  // 1) YouTube 발굴 — 국내(KR)
  let koTerms: string[] = [];
  try {
    const kr = await discover(base, SEED_PRESETS.ko, "KR");
    koTerms = kr.map((c) => c.term!).filter(Boolean);
    await flush(kr, "KR");
  } catch {
    errors.push("discover:KR");
  }

  // 1b) 해외(US·GB)
  for (const r of OVERSEAS_REGIONS) {
    try {
      await flush(await discover(base, SEED_PRESETS.en, r), r);
    } catch {
      errors.push(`discover:${r}`);
    }
  }

  // 2) 자동완성 확장 — 국내 발굴어를 시드로(source=search)
  if (koTerms.length) {
    try {
      const acRes = await fetch(`${base}/api/naver-ac`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds: koTerms.slice(0, 20) }),
        cache: "no-store",
      });
      if (acRes.ok) {
        const acJson = (await acRes.json()) as { candidates?: Array<{ term: string }> };
        const cands: LogCandidate[] = (acJson.candidates ?? []).map((c) => ({
          term: c.term,
          source: "search",
          novel: false,
        }));
        await flush(cands, "ac");
      }
    } catch {
      errors.push("autocomplete");
    }
  }

  return NextResponse.json({ ok: true, at, added, done, errors });
}
