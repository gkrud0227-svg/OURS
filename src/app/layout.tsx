import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store-context";
import { Nav } from "@/components/Nav";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "크림보드",
  description:
    "식품·디저트 트렌드를 매주 모니터링하고 급상승 키워드로 다음 제품을 선정하는 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <StoreProvider>
          {/*
           * 셸의 폭 규칙은 실제 대시보드(1240px 고정)와 체험 화면(유동)이 다르다.
           * 갈리는 지점이 경로라서 클라이언트 컴포넌트로 뺐다 — 자세한 이유는 Shell 주석.
           */}
          <Shell>
            <Nav />
            <main className="px-4 pt-5 pb-7 sm:px-[26px] sm:pt-6 sm:pb-[30px]">{children}</main>
          </Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
