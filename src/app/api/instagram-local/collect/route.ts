import { NextResponse } from "next/server";

import { errorResponse, localOnly } from "../_utils";
import {
  getInstagramLocalService,
  type InstagramLocalCollectOptions,
} from "@/server/instagram-local/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  let body: InstagramLocalCollectOptions;
  try {
    body = await request.json();
  } catch {
    return errorResponse("잘못된 요청 본문입니다.", 400);
  }

  try {
    const service = getInstagramLocalService();
    return NextResponse.json(await service.collect(body));
  } catch (error) {
    return errorResponse(error);
  }
}
