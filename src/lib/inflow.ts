/**
 * 해외 → 국내 **유입 판정**.
 *
 * 해외 발굴의 근본 약점은 검증 소스가 없다는 것이었다 — 데이터랩·검색광고·쇼핑이 전부
 * 한국 전용이라 콘텐츠 급상승(lift) 하나로만 버텼고, 그래서 인도 명절어(rakshabandhan·onam)
 * 같은 게 상위에 올라와도 걸러낼 근거가 없었다.
 *
 * 질문을 "해외에서 뜨는 게 뭔가"에서 **"해외에서 떴고 한국으로 들어오는 중인 게 뭔가"** 로
 * 바꾸면 국내 검색 데이터가 검증자로 들어온다. 한국과 무관한 트렌드는 국내 신호가 없어
 * 자동으로 밀려난다 — 언어 필터로 못 잡던 관련성을 이 기준이 대신 잡는다.
 *
 * 기획자가 실제로 원하는 건 "유입 중"(해외에서 뜨는데 국내는 이제 막 시작) 목록이다.
 */

import { trendFromWeeks } from "./trend";
import type { WeekPoint } from "./types";

export type InflowStatus =
  /** 해외는 뜨는데 국내 검색 신호가 없다 — 아직 안 들어옴. 감시 대상. */
  | "notYet"
  /** 해외에서 뜨고 국내도 오르기 시작했는데 아직 규모가 작다 — **지금이 기회**. */
  | "arriving"
  /** 국내에서 이미 큰 규모이거나 신호가 정체 — 이미 들어와 있다. */
  | "arrived"
  /** 해외는 식었는데 국내가 오른다 — 지연 유입. 짧게 끝날 수 있다. */
  | "late"
  /** 한글 표기를 확정하지 못해 국내 신호를 조회하지 못했다. 신호 없음과 구분한다. */
  | "unknownSpelling";

export interface InflowInput {
  /** 해외 콘텐츠 급상승 배수(유튜브). 매체 발굴 후보에는 없으므로 null 이 온다. */
  lift: number | null;
  /**
   * 해외에서 아직 힘이 있는가 — **발굴 소스마다 근거가 다르다.**
   *   유튜브: 급증 배수(lift)가 문턱 이상
   *   해외 매체: 새로 등장했거나 더 많은 매체로 번지는 중
   * 주어지면 그대로 쓰고, 없으면 lift 로 판단한다. 매체 후보에 lift 가 없다고 해서
   * "해외에서 식었다"로 보면 안 되기 때문에 이 갈래가 필요하다.
   */
  overseasAlive?: boolean;
  /** 국내 검색 주간 추이. 표기를 못 찾았으면 null(빈 배열과 구분). */
  weeks: WeekPoint[] | null;
  /** 국내 월간 검색량(검색광고). 규모 판정용. 없으면 0. */
  volumeTotal?: number;
}

export interface InflowResult {
  status: InflowStatus;
  /** 국내 상승률(%) — 표기를 못 찾았으면 null. */
  riseRate: number | null;
  /** 정렬용 점수. 높을수록 먼저 봐야 한다. */
  score: number;
}

/** 해외에서 아직 뜨고 있다고 볼 최소 급증 배수. 1 근처면 원래도 흔한 말이다. */
export const OVERSEAS_ALIVE_LIFT = 1.3;
/** 국내가 "오르기 시작했다"고 볼 최소 상승률(%). */
export const INFLOW_RISE_MIN = 20;
/**
 * 국내 월간 검색량이 이 값을 넘으면 이미 자리 잡은 것으로 본다.
 * 넘지 않으면 아직 초기라 기획 여지가 있다.
 * (trend.ts 의 MIN_DISCOVERY_VOLUME 1만은 "발굴 가치" 기준이라 목적이 다르다 — 여기선
 *  "이미 늦었나"를 보므로 더 높게 잡는다.)
 */
export const ARRIVED_VOLUME = 30_000;

/**
 * 국내 검색 신호가 "있다"고 볼 최소 주 수.
 * 데이터랩은 검색량이 아주 적으면 0만 돌려주므로, 0 아닌 주가 몇 개는 있어야 신호로 본다.
 */
const MIN_NONZERO_WEEKS = 3;

/**
 * 마지막 주가 최근 4주 최고치의 이 비율 미만이면 **이미 꺼진 단발 스파이크**로 본다.
 *
 * 상승률은 4주 이동평균이라 한 주만 튄 것도 크게 잡힌다. 실측: 비리야니의 최근 8주가
 * 37→41→48→38→40→40→**100**→40 이었는데 상승률 +74% 로 "유입 중" 1위에 올랐다.
 * 실제로는 한 주 튀고 곧바로 제자리로 돌아온 것이고, 월간 검색량도 1,490건뿐이었다.
 * 유입은 몇 주에 걸쳐 일어나므로, 마지막 주가 꺼졌으면 유입으로 보지 않는다.
 */
const SPIKE_ALIVE_RATIO = 0.6;

function hasDomesticSignal(weeks: WeekPoint[]): boolean {
  return weeks.filter((w) => w.ratio > 0).length >= MIN_NONZERO_WEEKS;
}

/** 최근 상승이 아직 살아 있는가 — 마지막 주가 제자리로 돌아왔으면 단발 스파이크다. */
function riseStillAlive(weeks: WeekPoint[]): boolean {
  const recent = weeks.slice(-4);
  if (recent.length < 3) return true; // 판단할 표본이 없으면 막지 않는다
  const peak = Math.max(...recent.map((w) => w.ratio));
  if (peak <= 0) return false;
  return recent[recent.length - 1].ratio >= peak * SPIKE_ALIVE_RATIO;
}

/**
 * 해외 후보 하나의 유입 상태를 판정한다.
 *
 * ⚠️ `weeks === null`(표기 미확인)과 `weeks === []`(조회했는데 신호 없음)은 **다르다.**
 *    전자를 "아직 안 들어옴"으로 처리하면, 표기를 못 맞춘 실패가 트렌드 판단으로 둔갑한다.
 */
export function judgeInflow(input: InflowInput): InflowResult {
  const { lift, weeks, volumeTotal = 0 } = input;

  if (weeks === null) {
    return { status: "unknownSpelling", riseRate: null, score: 0 };
  }

  const t = trendFromWeeks(weeks);
  const rise = t.riseRate;
  const overseasAlive = input.overseasAlive ?? (lift ?? 0) >= OVERSEAS_ALIVE_LIFT;
  const domesticRising = rise !== null && rise >= INFLOW_RISE_MIN;
  const signal = hasDomesticSignal(weeks);

  // 국내에 아무 신호가 없다 — 아직 안 들어왔다.
  if (!signal) {
    return { status: "notYet", riseRate: rise, score: overseasAlive ? 40 : 10 };
  }

  // 이미 규모가 크면 늦었다 (오르든 말든).
  if (volumeTotal >= ARRIVED_VOLUME) {
    return { status: "arrived", riseRate: rise, score: 20 };
  }

  // 한 주 튀고 꺼진 것은 유입이 아니다 — 상승률만 보면 이걸 못 거른다.
  if (domesticRising && !riseStillAlive(weeks)) {
    return { status: "notYet", riseRate: rise, score: overseasAlive ? 30 : 10 };
  }

  if (domesticRising) {
    // 해외도 살아 있고 국내가 막 오르기 시작 — 가장 가치 있는 구간.
    if (overseasAlive) {
      // 상승률이 클수록, 아직 규모가 작을수록 먼저 본다.
      const riseBonus = Math.min(30, (rise ?? 0) / 4);
      return { status: "arriving", riseRate: rise, score: 70 + riseBonus };
    }
    // 해외는 식었는데 국내만 오른다 — 뒤늦게 들어온 것이라 짧게 끝날 수 있다.
    return { status: "late", riseRate: rise, score: 35 };
  }

  // 신호는 있는데 오르지 않는다 — 들어왔지만 정체.
  return { status: "arrived", riseRate: rise, score: 15 };
}

export const INFLOW_META: Record<InflowStatus, { label: string; desc: string }> = {
  arriving: {
    label: "유입 중",
    desc: "해외에서 뜨고 국내도 오르기 시작했는데 아직 규모가 작습니다. 지금이 기획 시점입니다.",
  },
  notYet: {
    label: "미유입",
    desc: "해외에서는 뜨는데 국내 검색 신호가 아직 없습니다. 감시 대상입니다.",
  },
  arrived: {
    label: "도착 완료",
    desc: "국내에 이미 자리 잡았습니다. 지금은 크게 오르내리지 않습니다.",
  },
  late: {
    label: "지연 유입",
    desc: "해외에서는 식었는데 국내만 오릅니다. 짧게 끝날 수 있습니다.",
  },
  unknownSpelling: {
    label: "표기 미확인",
    desc: "한글 표기를 확정하지 못해 국내 검색을 조회하지 못했습니다. 신호가 없는 것과 다릅니다.",
  },
};

/**
 * 화면에 보여줄 **3분류**.
 *
 * 내부 상태는 5개지만(유입 중·미유입·지연 유입·도착 완료·표기 미확인), 화면에 다 내면
 * 읽는 사람이 무엇을 해야 할지 판단하기 어렵다. **행동 기준**으로 셋으로 묶는다.
 * 구체적인 사유는 툴팁에 남겨 정보는 잃지 않는다.
 *
 * ⚠️ 표기 미확인은 트렌드 상태가 아니라 **데이터 실패**다. 셋 중 하나로 섞으면
 *    "판정을 못 했다"가 "판정 결과"로 둔갑한다. 그래서 분류 밖에 따로 둔다.
 */
export type InflowGroup = "opportunity" | "candidate" | "mature" | "unknown";

export const INFLOW_GROUP: Record<InflowStatus, InflowGroup> = {
  arriving: "opportunity", // 해외 뜨고 국내도 막 시작 — 지금 움직일 것
  notYet: "candidate", // 해외만 뜨고 국내는 아직 — 지켜볼 것
  late: "mature", // 해외는 식었는데 국내만 오름 — 이미 들어와 있다
  arrived: "mature", // 국내에 이미 자리 잡음
  unknownSpelling: "unknown", // 판정 자체를 못 함
};

export const GROUP_META: Record<InflowGroup, { label: string; desc: string }> = {
  opportunity: {
    label: "기회",
    desc: "해외에서 뜨고 국내도 오르기 시작했는데 아직 규모가 작습니다. 지금 움직일 대상입니다.",
  },
  candidate: {
    label: "후보",
    desc: "해외에서는 뜨는데 국내 검색은 아직 없습니다. 들어오는지 지켜볼 대상입니다.",
  },
  mature: {
    label: "성숙",
    // ⚠️ "늦었다"고 단정하지 않는다. 성숙한 카테고리도 라인 확장·프리미엄화 같은 기획 여지가
    //    있다. 사실만 말하고 판단은 기획자에게 맡긴다.
    desc: "국내에 이미 자리 잡은 카테고리입니다. 신규 발굴 대상은 아니지만, 라인 확장이나 프리미엄화 같은 기획은 가능합니다.",
  },
  unknown: {
    label: "판정 불가",
    desc: "한글 표기를 찾지 못해 국내 검색을 조회하지 못했습니다. 국내에 없다는 뜻이 아닙니다.",
  },
};

/** 화면 정렬 우선순위 — 유입 중을 맨 위로. */
export const INFLOW_RANK: Record<InflowStatus, number> = {
  arriving: 4,
  notYet: 3,
  late: 2,
  arrived: 1,
  unknownSpelling: 0,
};
