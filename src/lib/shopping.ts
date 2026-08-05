import { trendFromWeeks, type TrendStatus } from "./trend";
import type { WeekPoint } from "./types";

/**
 * 쇼핑인사이트(구매 의향) 클라이언트.
 *
 * 검색 검증 위에 얹는 세 번째 축이다. 검색은 "관심", 쇼핑 클릭은 "구매 의향"이라
 * 검색만 오르고 쇼핑이 따라오지 않으면 화제성에 그친 트렌드로 본다.
 *
 * 값은 요청에 함께 넣은 키워드 그룹 기준으로 정규화되므로 **키워드 간 절대 비교는
 * 하지 않는다.** 우리가 쓰는 건 같은 키워드 안에서의 시간 변화(상승률)뿐이라
 * 정규화 배율에 영향받지 않는다.
 */
export interface ShoppingTrend {
  status: TrendStatus;
  riseRate: number | null;
  weeks: WeekPoint[];
}

export async function fetchShopping(keywords: string[]): Promise<Map<string, ShoppingTrend>> {
  const out = new Map<string, ShoppingTrend>();
  if (!keywords.length) return out;

  const res = await fetch("/api/shopping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
  });
  if (!res.ok) return out; // 보조 신호 — 실패해도 화면은 검색 축으로 돌아간다.

  const json = (await res.json()) as {
    results?: { title: string; data: WeekPoint[] }[];
  };
  for (const r of json.results ?? []) {
    const weeks = r.data ?? [];
    const t = trendFromWeeks(weeks);
    out.set(r.title, {
      status: weeks.length ? t.status : "none",
      riseRate: t.riseRate,
      weeks,
    });
  }
  return out;
}

/** 구매 의향 등급 — 화면 표시용. */
export const SHOP_META: Record<
  "rising" | "flat" | "none",
  { label: string; tone: "good" | "muted" }
> = {
  rising: { label: "구매 상승", tone: "good" },
  flat: { label: "변화 없음", tone: "muted" },
  none: { label: "쇼핑 데이터 없음", tone: "muted" },
};

export function shopGrade(t: ShoppingTrend | undefined): "rising" | "flat" | "none" {
  if (!t || !t.weeks.length) return "none";
  return t.status === "surge" || t.status === "up" ? "rising" : "flat";
}
