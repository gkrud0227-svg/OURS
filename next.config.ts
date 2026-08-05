import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 이 프로젝트는 상위 폴더(harness-pulmuone Next.js 프로젝트) 안에 위치한다.
  // 워크스페이스 루트를 이 디렉터리로 고정해, 상위 프로젝트의 파일(예: src/proxy.ts)이
  // 빌드에 섞여 들어오지 않도록 격리한다.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // 프로덕션 파일 트레이싱 루트도 동일하게 고정.
  outputFileTracingRoot: path.resolve(__dirname),
  // 대용량 로컬 캐시/데이터(8MB odm-cache 등)와 비런타임 폴더를 트레이싱에서 제외한다.
  // 배포(Vercel)에선 Supabase 를 쓰므로 이 파일들은 번들에 필요 없다. (빌드 메모리·번들 축소)
  outputFileTracingExcludes: {
    "*": [
      "./data/**",
      "./scripts/**",
      "./supabase/**",
      "./docs/**",
      "./.playwright-mcp/**",
      "./public/**/*.map",
    ],
  },
  // 127.0.0.1 로 열면 Next 가 HMR 을 교차 출처로 차단해 하이드레이션이 안 된다
  // (버튼·검색이 먹통이 되고 폼이 새로고침된다). localhost 와 동일하게 허용한다.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
