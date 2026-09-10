"use client";

import { usePathname } from "next/navigation";

/**
 * 대시보드 셸 — 지면(#EFEADC) 위에 놓인 2px 구획 프레임.
 *
 * 폭 규칙이 두 갈래다.
 *
 * - **실제 대시보드**: 최소 폭 1240px 고정 + 가로 스크롤. 순위·배수·상태를 한 화면에서
 *   비교하는 것이 표의 목적이라 컬럼을 접지 않는다(디자인 명세). 데스크톱 전용 도구다.
 * - **체험 화면(/demo)**: 배너 QR 로 들어오니 **대부분 휴대폰**이다. 여기서 1240px 를
 *   고집하면 첫 화면이 가로로 밀려 아무것도 못 읽는다. 폭을 화면에 맞추고, 표는 각
 *   화면에서 세로로 쌓이도록 따로 짰다.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const demo = pathname === "/demo" || pathname.startsWith("/demo/");

  return (
    <div
      className={
        demo
          ? "flex justify-center p-3 sm:p-7"
          : "flex justify-center overflow-x-auto p-7"
      }
    >
      <div className={demo ? "cb-shell cb-shell--fluid" : "cb-shell"}>{children}</div>
    </div>
  );
}
