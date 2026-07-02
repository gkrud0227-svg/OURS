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
};

export default nextConfig;
