import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store-context";
import { Nav } from "@/components/Nav";

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
           * 지면(#EFEADC) 위에 놓인 2px 구획 프레임.
           * ⚠️ 최소 폭 1240px 을 유지하고 좁은 화면에서는 가로 스크롤로 넘긴다 —
           *    순위·배수·상태를 한 화면에서 비교하는 것이 이 표의 목적이라
           *    컬럼을 접으면 화면이 성립하지 않는다.
           */}
          <div className="flex justify-center overflow-x-auto p-7">
            <div className="cb-shell">
              <Nav />
              <main className="px-[26px] pt-6 pb-[30px]">{children}</main>
            </div>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
