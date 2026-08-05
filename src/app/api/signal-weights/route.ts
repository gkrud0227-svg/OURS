import { NextResponse } from "next/server";
import { labelInputs, readLogAsInputs } from "@/lib/label-log";
import { summarizeLabels } from "@/lib/discovery-label";
import { computeSignalWeights, neutralWeights } from "@/lib/signal-weights";
import { readWeights, writeWeights } from "@/lib/signal-weights-store";

/**
 * 학습된 신호 가중치 API (3단계).
 *
 *  - GET  : 현재 캐시된 가중치를 반환(발굴이 점수에 적용).
 *  - POST : 전향적 로그를 라벨링해 가중치를 **재학습**하고 저장.
 *
 * 데이터가 적으면(성숙 라벨 < MIN_MATURED) computeSignalWeights 가 **중립**을 돌려주므로,
 * 발굴 동작은 데이터가 쌓이기 전까지 그대로다(안전).
 */

export async function GET() {
  try {
    return NextResponse.json(await readWeights());
  } catch (e) {
    return NextResponse.json(
      { error: "가중치 읽기 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const generatedAt = new Date().toISOString();

  // 데모 모드: {entries} 를 주면 그것만 라벨링해 가중치를 계산(저장하지 않음).
  // 로그가 비었을 때 자기강화가 실제로 도는지 시연하기 위함.
  let demoEntries:
    | Array<{ term?: string; firstSeenAt?: string; source?: string; novel?: boolean }>
    | undefined;
  try {
    const body = (await request.json()) as { entries?: typeof demoEntries };
    demoEntries = Array.isArray(body?.entries) ? body.entries : undefined;
  } catch {
    /* 본문 없음 = 실제 로그 재학습 */
  }

  if (demoEntries) {
    const inputs = demoEntries
      .map((e) => ({
        term: (e.term ?? "").trim(),
        firstSeenAt: e.firstSeenAt ?? generatedAt,
        source: e.source ?? "demo",
        novel: e.novel ?? null,
        lift: null,
      }))
      .filter((i) => i.term);
    if (!inputs.length) {
      return NextResponse.json({ error: "라벨링할 키워드가 없습니다." }, { status: 400 });
    }
    const { results, error } = await labelInputs(inputs);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const weights = computeSignalWeights(results, generatedAt);
    return NextResponse.json({
      weights,
      summary: summarizeLabels(results),
      labeled: results.length,
      demo: true,
      note: "데모 계산(저장 안 함).",
    });
  }

  let inputs;
  try {
    inputs = await readLogAsInputs();
  } catch (e) {
    return NextResponse.json(
      { error: "로그 읽기 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  if (!inputs.length) {
    const weights = { ...neutralWeights(0), generatedAt };
    await writeWeights(weights);
    return NextResponse.json({
      weights,
      summary: summarizeLabels([]),
      note: "전향적 로그가 비어 있어 중립 가중치로 저장했습니다.",
    });
  }

  const { results, error } = await labelInputs(inputs);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const weights = computeSignalWeights(results, generatedAt);
  try {
    await writeWeights(weights);
  } catch (e) {
    return NextResponse.json(
      { error: "가중치 저장 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  return NextResponse.json({ weights, summary: summarizeLabels(results), labeled: results.length });
}
