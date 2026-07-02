"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "대시보드" },
  { href: "/keywords", label: "키워드 관리" },
  { href: "/scorecard", label: "스코어카드" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#fbfaf7]/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-6 sm:gap-8 sm:px-10">
        <Link href="/" className="flex items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pulmuone-logo.png"
            alt="Pulmuone"
            className="h-[30px] w-auto sm:h-[34px]"
          />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden text-[12.5px] font-semibold text-muted sm:block">
            트렌드 모니터
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-[9px] px-3.5 py-2 text-[13.5px] transition-colors ${
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

        <div className="flex-1" />

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
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12.5px] font-bold text-accent"
          >
            전
          </div>
        </div>
      </div>
    </header>
  );
}
