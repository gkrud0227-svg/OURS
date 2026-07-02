import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store-context";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "NATA TABLE · 트렌드 모니터",
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
          <Nav />
          <main className="mx-auto max-w-[1280px] px-6 py-9 sm:px-10">
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}
