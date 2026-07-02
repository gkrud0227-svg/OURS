import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../_utils";
import { getInstagramLocalService } from "@/server/instagram-local/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  let runId = "";
  try {
    const body = (await request.json()) as { runId?: string };
    runId = body.runId ?? "";
  } catch {
    return errorResponse("잘못된 요청 본문입니다.", 400);
  }

  if (!runId) return errorResponse("runId가 필요합니다.", 400);

  try {
    const service = getInstagramLocalService();
    return NextResponse.json(await service.exportCsv(runId));
  } catch (error) {
    return errorResponse(error);
  }
}
