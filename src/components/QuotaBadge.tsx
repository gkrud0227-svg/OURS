"use client";

import { useEffect, useState } from "react";
import { getQuota, DAILY_QUOTA, QUOTA_EVENT, type QuotaState } from "@/lib/quota";

/**
 * 유튜브 API 일일 쿼터(추정) 잔여를 화면에 상시 표시하는 배지.
 *
 * localStorage 기반이라 클라이언트에서만 값이 있다. SSR/첫 렌더에는 아무것도 그리지 않고
 * (하이드레이션 불일치 방지), 마운트 후 읽는다. 발굴로 addQuota() 가 호출되면 QUOTA_EVENT 로
 * 즉시 갱신되고, 탭 복귀(focus) 시에도 다시 읽는다.
 */
export function QuotaBadge() {
  const [q, setQ] = useState<QuotaState | null>(null);

  useEffect(() => {
    const read = () => setQ(getQuota());
    read();
    window.addEventListener(QUOTA_EVENT, read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener(QUOTA_EVENT, read);
      window.removeEventListener("focus", read);
    };
  }, []);

  if (!q) return null;

  const remainPct = Math.round((q.remaining / DAILY_QUOTA) * 100);
  // 잔여가 넉넉할 때만 그린 — 그린은 "여유 있다(조건 통과)"는 신호다.
  const color = q.remaining < 2000 ? "#0B0B0A" : q.remaining < 5000 ? "#5C5849" : "#00723F";

  return (
    <span
      title="유튜브 Data API 일일 쿼터 추정치입니다. 우리 발굴 사용량을 누적해 표시하며 한국시간 오후 4시(16:00)에 리셋됩니다. 실제 구글 집계와 다를 수 있어요."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 4,
        border: "1.5px solid #0B0B0A",
        background: "#FCFAF3",
        fontSize: 12,
        color: "#6E6B62",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>▮</span>
      YouTube 쿼터{" "}
      <span style={{ color: "#6E6B62" }}>
        오늘 사용{" "}
        <b style={{ color: "#0B0B0A", fontVariantNumeric: "tabular-nums" }}>
          {q.spent.toLocaleString()}
        </b>
      </span>
      <span style={{ color: "#C9C4B2" }}>·</span>
      <span style={{ color: "#6E6B62" }}>
        잔여{" "}
        <b style={{ color, fontVariantNumeric: "tabular-nums" }}>{q.remaining.toLocaleString()}</b>{" "}
        ({remainPct}%)
      </span>
      <span style={{ color: "#C9C4B2" }}>/ {DAILY_QUOTA.toLocaleString()}</span>
    </span>
  );
}
