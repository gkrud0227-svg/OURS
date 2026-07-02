import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../../_utils";
import { getInstagramLocalService } from "@/server/instagram-local/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  try {
    const service = getInstagramLocalService();
    return NextResponse.json(await service.closeBrowser());
  } catch (error) {
    return errorResponse(error);
  }
}
