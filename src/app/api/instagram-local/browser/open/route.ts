import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../../_utils";
import { getInstagramLocalService } from "@/server/instagram-local/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  try {
    const progress: unknown[] = [];
    const service = getInstagramLocalService();
    const browser = await service.openBrowser((message) => progress.push(message));
    return NextResponse.json({ browser, progress });
  } catch (error) {
    return errorResponse(error);
  }
}
