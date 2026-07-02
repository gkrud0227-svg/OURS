import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../_utils";
import { getInstagramLocalService } from "@/server/instagram-local/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) return errorResponse("runId가 필요합니다.", 400);

  try {
    const service = getInstagramLocalService();
    return NextResponse.json({ trend: await service.getTrendForRun(runId) });
  } catch (error) {
    return errorResponse(error);
  }
}
