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
  { href: "/odm", label: "제조처 스크리닝" },
];

// 숨김(코드 보존 — /label, /radar, /backtest, /keywords, /instagram, /scorecard 로 직접 접근 가능):
// { href: "/label", label: "발굴 라벨링" },
//   라벨 데이터가 쌓이기 전까지 탭에서 감춘다. 화면·라우트·API 는 그대로 살아 있고
//   /label 로 직접 열린다. 발굴 결과 저장(discovery label)도 계속 동작한다.
// { href: "/radar", label: "식품 뉴스 스캔" },
//   ⚠️ 라우트는 살아 있어야 한다. 해외 트렌드 랭킹이 같은 소스(/api/food-news)를
//      내부적으로 불러 "뉴스" 배지 후보를 만든다. 탭만 감춘 것이다.
// { href: "/backtest", label: "예측 검증" },
//   경영진 설득용 근거 화면이라 자료를 만들 때 /backtest 로 직접 열어 쓴다.
// { href: "/keywords", label: "키워드 관리" },
// { href: "/instagram", label: "Instagram 수집" },
// { href: "/scorecard", label: "스코어카드" },

/**
 * 체험용 탭 — 배너 QR(`/demo`)로 들어온 사람이 보는 구성.
 *
 * ⚠️ 홈이 없다. 홈은 발굴 실행 화면이라 체험에서 보여줄 게 아니고, 트렌드 두 화면은
 *    고정 결과를 읽기만 한다. 제조처 스크리닝만 실제 조회가 돈다(같은 화면 그대로).
 */
const DEMO_LINKS = [
  { href: "/demo", label: "국내 트렌드" },
  { href: "/demo/global", label: "해외 트렌드" },
  { href: "/demo/odm", label: "제조처 스크리닝" },
];

function isActive(pathname: string, href: string): boolean {
  // "/" 와 "/demo" 는 하위 경로를 가지므로 정확히 일치할 때만 활성이다.
  if (href === "/" || href === "/demo") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * 크림보드 헤더.
 *
 * 태그라인("크림은 위로 뜹니다")은 헤더에 문장으로 넣지 않고 `CREAM RISES` 배지로
 * 대체한다 — 64px 안에서 문장은 로고·탭과 경쟁해 셋 다 흐려진다.
 *
 * ⚠️ 셸(2px 구획 프레임) 안에 들어가므로 sticky 가 아니다. 프레임 위쪽 모서리가
 *    떨어져 나가면 "지면 위에 놓인 인쇄물" 이라는 구성이 깨진다.
 */
export function Nav() {
  const pathname = usePathname();
  // 배너 QR 로 들어온 체험 화면은 탭 구성이 다르다.
  const demo = pathname === "/demo" || pathname.startsWith("/demo/");
  const links = demo ? DEMO_LINKS : LINKS;

  return (
    <header className="flex flex-col border-b-2 border-ink bg-surface sm:h-16 sm:flex-row sm:items-center sm:gap-6 sm:px-[26px]">
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-1.5 sm:contents">
      <Link href={demo ? "/demo" : "/"} className="flex shrink-0 items-center gap-[11px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pulmuone-logo.png" alt="Pulmuone" className="block h-[24px] w-auto sm:h-[30px]" />
        <span className="hidden h-[22px] w-[1.5px] bg-chip sm:block" />
        <span className="whitespace-nowrap text-[16px] font-black tracking-[-0.03em] text-ink sm:text-[19px]">
          크림보드
        </span>
        <span className="cb-mono hidden whitespace-nowrap rounded-[3px] bg-rise px-[7px] py-1 !text-[10px] !tracking-[0.1em] !text-ink lg:inline">
          CREAM RISES
        </span>
        {demo && (
          <span className="whitespace-nowrap rounded-[3px] border-[1.5px] border-ink px-1.5 py-[2px] text-[10.5px] font-extrabold text-ink sm:px-2 sm:py-[3px] sm:text-[11px]">
            데모
          </span>
        )}
      </Link>
      </div>

      <nav className="nt-scroll flex min-w-0 items-center gap-0.5 overflow-x-auto px-3 pb-2 sm:ml-1.5 sm:px-0 sm:pb-0">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`cb-row-hover shrink-0 whitespace-nowrap px-2.5 py-2 text-[12.5px] sm:px-[13px] sm:text-[13px] ${
                active
                  ? "rounded-[4px] bg-ink font-extrabold text-on-dark"
                  : "font-medium text-ink-2 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden h-[34px] w-[180px] items-center gap-2 rounded-[4px] border-[1.5px] border-ink bg-shell px-3.5 md:flex">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6B62" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <span className="whitespace-nowrap text-[12.5px] text-ink-4">키워드·카테고리 검색</span>
        </div>
        <div className="hidden h-8 w-8 items-center justify-center rounded-[4px] bg-ink text-[12.5px] font-black text-on-dark sm:flex">
          전
        </div>
      </div>
    </header>
  );
}
