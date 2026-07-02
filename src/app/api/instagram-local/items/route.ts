import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../_utils";
import { getInstagramLocalService } from "@/server/instagram-local/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 500);

  try {
    const service = getInstagramLocalService();
    return NextResponse.json({
      items: await service.listItems({
        runId,
        limit: Number.isFinite(limit) ? limit : 500,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
