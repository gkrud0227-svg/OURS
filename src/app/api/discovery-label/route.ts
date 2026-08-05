import { NextResponse } from "next/server";
import { labelInputs, readLogAsInputs } from "@/lib/label-log";
import { summarizeLabels, WINDOW_WEEKS, type LabelInput } from "@/lib/discovery-label";

/**
 * 전향적 로그 라벨링 API.
 *
 *  - GET  : 전향적 로그(discovery_log)를 라벨링해 오탐률·정밀도 산출.
 *  - POST : {terms|entries} 데모 입력을 라벨링 (실제 로그를 건드리지 않고 개념 시연용).
 */

export async function GET() {
  let inputs: LabelInput[];
  try {
    inputs = await readLogAsInputs();
  } catch (e) {
    return NextResponse.json(
      { error: "로그 읽기 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  if (!inputs.length) {
    return NextResponse.json({
      results: [],
      summary: summarizeLabels([]),
      window: WINDOW_WEEKS,
      note: "전향적 로그가 비어 있습니다. 발굴을 돌리면 후보가 쌓입니다.",
    });
  }
  const { results, error } = await labelInputs(inputs);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ results, summary: summarizeLabels(results), window: WINDOW_WEEKS });
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
