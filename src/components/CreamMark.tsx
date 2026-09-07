/**
 * 크림보드 마크 — 이름의 뜻을 그림 하나로 옮긴 것.
 *
 *   아래에서 방울이 올라오고(아직 안 보이는 신호),
 *   크림은 맨 위에 층을 이루고 있다(먼저 떠오른 트렌드).
 *
 * ⚠️ 네비에서는 18px 로 쓰인다. 그 크기에서 살아남도록 도형을 넷으로 묶었다
 *    (방울 2 · 크림층 1 · 잔 윤곽 1). 디테일을 더하면 작은 쪽이 먼저 무너진다.
 * ⚠️ 시안 비교에서 배운 것 둘.
 *    (1) 첫 시안은 "수면 위 돔"이었는데 26px 에서 초록 언덕으로만 보였다 — 크림도 상승도
 *        안 읽힌다. 담는 그릇이 있어야 "맨 위"라는 위치가 성립한다.
 *    (2) 크림층 아랫면을 직선으로 두면 배터리 아이콘처럼 보인다. 곡선이어야 액체 위에
 *        뜬 것으로 읽힌다.
 */
export function CreamMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={`${className} shrink-0`} aria-hidden="true">
      {/* 잔 */}
      <rect x="4.5" y="3" width="13" height="16" rx="3.6" className="fill-accent-soft" />
      {/* 아직 올라오는 중인 것들 */}
      <circle cx="9.2" cy="15.9" r="1.15" className="fill-accent" opacity="0.32" />
      <circle cx="13.2" cy="13.2" r="0.8" className="fill-accent" opacity="0.24" />
      {/* 맨 위에 뜬 크림 — 아랫면이 곡선이라 액체 위에 얹힌 것으로 읽힌다 */}
      <path
        d="M4.5 6.6A3.6 3.6 0 0 1 8.1 3h5.8a3.6 3.6 0 0 1 3.6 3.6v2.2c-2.6 0-2.6 1.5-5.2 1.5S6.9 8.8 4.5 8.8Z"
        className="fill-accent"
      />
      <rect
        x="4.5"
        y="3"
        width="13"
        height="16"
        rx="3.6"
        fill="none"
        className="stroke-accent"
        strokeWidth="1.1"
        opacity="0.35"
      />
    </svg>
  );
}
