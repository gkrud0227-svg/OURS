import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function localOnly(request: Request) {
  if (process.env.ENABLE_LOCAL_IG_COLLECTOR === "false") {
    return NextResponse.json(
      { error: "로컬 Instagram 수집기가 비활성화되어 있습니다." },
      { status: 403 },
    );
  }

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LOCAL_IG_COLLECTOR !== "true") {
    return NextResponse.json(
      {
        error:
          "로컬 Instagram 수집기는 운영 환경에서 기본 비활성화됩니다. ENABLE_LOCAL_IG_COLLECTOR=true 설정이 필요합니다.",
      },
      { status: 403 },
    );
  }

  const host = new URL(request.url).hostname;
  if (!LOCAL_HOSTS.has(host) && process.env.ENABLE_LOCAL_IG_COLLECTOR !== "true") {
    return NextResponse.json(
      { error: "로컬 Instagram 수집기는 localhost 요청에서만 사용할 수 있습니다." },
      { status: 403 },
    );
  }

  return null;
}

export function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}
