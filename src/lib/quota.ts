/**
 * YouTube API 일일 쿼터 추정 추적.
 *
 * YouTube Data API는 "잔여 쿼터 조회" 엔드포인트가 없다. 그래서 우리가 발굴 때마다
 * 예상 사용량을 누적하고, **태평양 표준시(PT) 자정** 리셋에 맞춰 하루 단위로 관리한다.
 * (구글 쿼터는 PT 자정에 리셋된다.)
 *
 * ⚠️ 실제 구글 집계가 아니라 **추정치**다. 같은 키를 다른 곳에서도 쓰면 오차가 난다.
 * localStorage 기반이라 브라우저별로 집계된다(단일 사용자 기준으로 충분).
 */

const KEY = "td.ytQuota.v1";
export const DAILY_QUOTA = 10_000;
/** 발굴 1회 시드당 유튜브 검색 쿼터 추정(최근 2p + 기준선 3p × 100 units). */
export const YT_UNITS_PER_SEED = 500;

/** 현재 PT(America/Los_Angeles) 날짜 YYYY-MM-DD. 쿼터 리셋 기준. */
function ptDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export interface QuotaState {
  spent: number;
  remaining: number;
}

/** 오늘(PT) 추정 사용량·잔여. 날짜가 바뀌면 자동으로 0부터. */
export function getQuota(): QuotaState {
  const today = ptDate();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as { date?: string; spent?: number };
    const spent = raw.date === today ? raw.spent ?? 0 : 0;
    return { spent, remaining: Math.max(0, DAILY_QUOTA - spent) };
  } catch {
    return { spent: 0, remaining: DAILY_QUOTA };
  }
}

/** 쿼터 배지가 실시간 갱신하도록 듣는 이벤트 이름. */
export const QUOTA_EVENT = "td-quota-changed";

/** 발굴 후 예상 사용량을 누적. 누적되면 화면 배지에 알린다. */
export function addQuota(units: number): void {
  const today = ptDate();
  const { spent } = getQuota();
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: today, spent: spent + Math.max(0, units) }));
    window.dispatchEvent(new Event(QUOTA_EVENT));
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 발굴 예상 사용량(units) — 국내 시드 + 해외 시드×리전. */
export function estimateUnits(domesticSeeds: number, overseasSeedsTimesRegions: number): number {
  return (domesticSeeds + overseasSeedsTimesRegions) * YT_UNITS_PER_SEED;
}

/** 확인창에 붙일 쿼터 안내 문구. */
export function quotaLine(estimate: number): string {
  const { spent, remaining } = getQuota();
  const after = Math.max(0, remaining - estimate);
  return (
    `예상 사용 약 ${estimate.toLocaleString()} units\n` +
    `오늘 사용(추정) ${spent.toLocaleString()} / ${DAILY_QUOTA.toLocaleString()} · ` +
    `잔여 약 ${remaining.toLocaleString()} → 발굴 후 약 ${after.toLocaleString()}`
  );
}
