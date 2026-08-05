"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * IR·발표용으로 예측 파이프라인(발굴 → 검증 → 소싱)만 상단에 노출한다.
 * 아래 보조 탭들은 라우트·코드가 그대로 살아 있고 URL 로 직접 접근 가능하다.
 * 다시 노출하려면 HIDDEN 에서 LINKS 로 옮기면 된다.
 */
const LINKS = [
  { href: "/", label: "홈" },
  { href: "/domestic", label: "국내 트렌드" },
  { href: "/global", label: "해외 트렌드" },
  { href: "/radar", label: "식품 뉴스 스캔" },
  { href: "/backtest", label: "예측 검증" },
  { href: "/label", label: "발굴 라벨링" },
  { href: "/odm", label: "ODM 스크리닝" },
];

// 숨김(코드 보존 — /keywords, /instagram, /scorecard 로 직접 접근 가능):
// { href: "/keywords", label: "키워드 관리" },
// { href: "/instagram", label: "Instagram 수집" },
// { href: "/scorecard", label: "스코어카드" },

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#fbfaf7]/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:gap-8 sm:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pulmuone-logo.png"
            alt="Pulmuone"
            className="h-[24px] w-auto sm:h-[34px]"
          />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden text-[12.5px] font-semibold text-muted sm:block">
            트렌드 모니터
          </span>
        </Link>

        <nav className="nt-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex-none md:overflow-visible">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 whitespace-nowrap rounded-[9px] px-2.5 py-2 text-[13.5px] transition-colors sm:px-3.5 ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-ink"
                    : "font-medium text-muted-strong hover:bg-[#f2f0eb] hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden flex-1 md:block" />

        <div className="flex items-center gap-3.5">
          <div className="hidden h-9 w-[210px] items-center gap-2 rounded-[10px] border border-line bg-white px-3 md:flex">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9c978c"
              strokeWidth="2.2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <span className="text-[13px] text-[#b4afa4]">키워드·카테고리 검색</span>
          </div>
          <div
            style={{ background: "linear-gradient(145deg,#edf3e0,#d9e7bf)" }}
            className="hidden h-[34px] w-[34px] items-center justify-center rounded-full text-[12.5px] font-bold text-accent sm:flex"
          >
            전
          </div>
        </div>
      </div>
    </header>
  );
}
