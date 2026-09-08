import { NextResponse } from "next/server";
import { labelAndStore, labelInputs } from "@/lib/label-log";
import { readLog } from "@/lib/discovery-log-store";
import {
  summarizeLabels,
  WINDOW_WEEKS,
  type LabelInput,
  type LabelResult,
} from "@/lib/discovery-label";

/**
 * 전향적 로그 라벨링 API.
 *
 *  - GET            : **저장된** 라벨로 오탐률·정밀도를 즉시 산출(조회만, 외부 호출 없음).
 *  - GET ?batch=N   : 아직 판정 안 한 후보 N건을 라벨링하고 결과를 로그에 저장.
 *  - POST           : {terms|entries} 데모 입력을 라벨링(실제 로그를 건드리지 않음).
 *
 * ⚠️ 예전엔 GET 이 매번 30건을 새로 조회했다(123초). 결과를 저장하지 않으니 화면을 닫으면
 *    사라지고, 405건을 끝까지 판정할 방법이 없었다. 이제 판정(batch)과 조회(기본 GET)를
 *    나눠, 화면은 즉시 뜨고 판정은 배치로 이어 돈다.
 * ⚠️ 서버리스 함수 시간 제한이 있으니 batch 를 크게 주지 말 것 — 건당 약 4초다.
 */

export const maxDuration = 60;

export async function GET(request: Request) {
  const batch = Number(new URL(request.url).searchParams.get("batch") ?? 0);

  // 판정 모드 — 미판정 후보 batch 건을 라벨링해 저장한다.
  if (batch > 0) {
    try {
      const { results, saved, remaining, error } = await labelAndStore(Math.min(batch, 60));
      if (error) return NextResponse.json({ error }, { status: 400 });
      return NextResponse.json({ labeled: results.length, saved, remaining, results });
    } catch (e) {
      return NextResponse.json(
        { error: "라벨링 실패", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // 조회 모드 — 저장된 라벨만 읽는다(외부 호출 없음).
  let entries;
  try {
    entries = await readLog();
  } catch (e) {
    return NextResponse.json(
      { error: "로그 읽기 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  if (!entries.length) {
    return NextResponse.json({
      results: [],
      summary: summarizeLabels([]),
      window: WINDOW_WEEKS,
      unlabeled: 0,
      note: "전향적 로그가 비어 있습니다. 발굴을 돌리면 후보가 쌓입니다.",
    });
  }

  const labeled = entries.filter((e) => e.label != null);
  const unlabeled = entries.length - labeled.length;
  // 저장된 값만으로 LabelResult 모양을 복원한다 — 요약 계산에 쓰이는 필드만 채운다.
  const results: LabelResult[] = labeled.map((e) => ({
    term: e.term,
    firstSeenAt: e.firstSeenAt,
    source: e.source,
    novel: e.novel,
    lift: e.lift,
    label: e.label as LabelResult["label"],
    observedWeeks: e.observedWeeks ?? 0,
    baselineRatio: null,
    peakAfter: null,
    riseAfterPct: e.peakRise,
    weeksToPeak: null,
    reason: e.labelReason ?? "",
  }));
  return NextResponse.json({
    results,
    summary: summarizeLabels(results),
    window: WINDOW_WEEKS,
    unlabeled,
    total: entries.length,
  });
}

export async function POST(request: Request) {
  let body: {
    terms?: unknown;
    firstSeenAt?: string;
    entries?: Array<{ term?: string; firstSeenAt?: string; source?: string; novel?: boolean }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  let inputs: LabelInput[] = [];
  if (Array.isArray(body.entries)) {
    const fallback = body.firstSeenAt ?? new Date().toISOString();
    inputs = body.entries
      .map((e) => ({
        term: (e.term ?? "").trim(),
        firstSeenAt: e.firstSeenAt ?? fallback,
        source: e.source ?? "demo",
        novel: e.novel ?? null,
        lift: null,
      }))
      .filter((i) => i.term);
  } else if (Array.isArray(body.terms)) {
    const at = body.firstSeenAt ?? new Date().toISOString();
    inputs = (body.terms as unknown[])
      .map((t) => ({ term: String(t).trim(), firstSeenAt: at, source: "demo", novel: null, lift: null }))
      .filter((i) => i.term);
  }

  if (!inputs.length) {
    return NextResponse.json({ error: "라벨링할 키워드가 없습니다." }, { status: 400 });
  }

  const { results, error } = await labelInputs(inputs);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ results, summary: summarizeLabels(results), window: WINDOW_WEEKS });
}
