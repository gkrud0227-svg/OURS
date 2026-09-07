/**
 * YouTube API 일일 쿼터 추정 추적.
 *
 * YouTube Data API는 "잔여 쿼터 조회" 엔드포인트가 없다. 그래서 우리가 발굴 때마다
 * 예상 사용량을 누적하고, **한국시간(KST) 16:00** 리셋에 맞춰 하루 단위로 관리한다.
 *
 * 구글 쿼터 자체는 태평양시 자정에 리셋되는데, 그 시각이 한국시간으로 여름(PDT) 16:00·
 * 겨울(PST) 17:00이다. 사용자 관측(16:00)에 맞춰 **한국시간 16:00을 고정 경계**로 둔다.
 * KST는 서머타임이 없어 16:00 KST = 07:00 UTC로 고정되므로 DST에 흔들리지 않는다.
 * (겨울엔 실제 구글 리셋보다 1시간 이르지만 어차피 추정치라 무방하다.)
 *
 * ⚠️ 실제 구글 집계가 아니라 **추정치**다. 같은 키를 다른 곳에서도 쓰면 오차가 난다.
 * localStorage 기반이라 브라우저별로 집계된다(단일 사용자 기준으로 충분).
 */

const KEY = "td.ytQuota.v1";
export const DAILY_QUOTA = 10_000;
/** 발굴 1회 시드당 유튜브 검색 쿼터 추정(최근 6p + 기준선 3p × 100 units). */
export const YT_UNITS_PER_SEED = 900;
/**
 * "키워드별 확산 이유" 1건 비용 — 제품 하나를 order=viewCount로 검색(100 units)하고
 * 인기 영상 댓글(~4 units)을 본다. 표에서 키워드를 하나 눌러 이유를 볼 때도 이 비용이다.
 */
export const YT_KEYWORD_REASON_PER_KEYWORD = 100 + 4;
/** 국내 발굴 1회당 자동 집계 비용 — 상위 제품 약 6개 × 1건 비용. */
export const YT_KEYWORD_REASON_UNITS = 6 * YT_KEYWORD_REASON_PER_KEYWORD;

/**
 * 쿼터 리셋 기준일 YYYY-MM-DD. 하루 경계 = **한국시간 16:00**.
 *
 * 16:00 KST = 07:00 UTC(KST는 DST 없음)이므로, 현재 시각에서 7시간을 당긴 UTC 날짜가
 * 16:00을 넘어가는 순간 바뀐다. 15:59 KST면 전날, 16:00 KST면 당일이 된다.
 */
function quotaDay(): string {
  return new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface QuotaState {
  spent: number;
  remaining: number;
}

/** 오늘(KST 16:00 기준) 추정 사용량·잔여. 경계를 넘기면 자동으로 0부터. */
export function getQuota(): QuotaState {
  const today = quotaDay();
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
  const today = quotaDay();
  const { spent } = getQuota();
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: today, spent: spent + Math.max(0, units) }));
    window.dispatchEvent(new Event(QUOTA_EVENT));
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 발굴 예상 사용량(units) — 국내 시드 + 해외 시드×리전. 국내 발굴엔 키워드별 이유 비용을 더한다. */
export function estimateUnits(domesticSeeds: number, overseasSeedsTimesRegions: number): number {
  const base = (domesticSeeds + overseasSeedsTimesRegions) * YT_UNITS_PER_SEED;
  return base + (domesticSeeds > 0 ? YT_KEYWORD_REASON_UNITS : 0);
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
