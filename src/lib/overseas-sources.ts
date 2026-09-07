/**
 * 해외 발굴 **두 소스 합치기** — 유튜브 콘텐츠 + 해외 식품 매체.
 *
 * 두 소스는 서로 다른 것을 본다.
 *   유튜브   — 창작자가 **이미 만들고 있는** 것. 확산 속도가 빠르지만 이름이 굳은 뒤다.
 *   식품 매체 — 에디터가 **이름 붙인** 것. 물량은 적지만 명명이 이르다.
 * 한 랭킹에 합쳐야 "어느 쪽에서 먼저 잡혔나"를 나란히 볼 수 있다.
 *
 * ⚠️ 매체 후보는 **새로 등장했거나 번지는 중(new·rising)인 말만** 가져온다.
 *    매체 스캔은 기사 본문에서 용어를 뽑으므로 상위가 chicken·cream·butter 같은
 *    일반 재료어로 채워진다(실측: 상위 50개가 전부 known). 그걸 그대로 합치면
 *    랭킹이 오염된다 — 매체의 가치는 "무엇이 **새로** 불리기 시작했나"에 있다.
 */

import type { DiscoverCandidate } from "./global";
import type { NewsTerm } from "./trend-radar";

/** 후보가 어느 소스에서 나왔는가. */
export type OverseasSource = "youtube" | "media" | "both";

export interface MergedCandidate {
  term: string;
  source: OverseasSource;
  /** 유튜브 급증 배수. 매체 단독 후보면 null. */
  lift: number | null;
  /** 유튜브에서 이 말을 쓴 채널 수. */
  channels: number | null;
  /** 이 말이 등장한 해외 매체 수. 유튜브 단독 후보면 null. */
  mediaCount: number | null;
  /** 매체 기준 신규성 — 새로 등장(new)인지, 더 많은 매체로 번지는 중(rising)인지. */
  novelty: NewsTerm["novelty"] | null;
  /** 예시(영상 제목 또는 기사 헤드라인). */
  sample: string | null;
  /** 해외에서 아직 힘이 있는가 — 소스별 근거를 합쳐 판단한다. */
  overseasAlive: boolean;
}

/** 유튜브 후보가 "해외에서 살아 있다"고 볼 최소 급증 배수. inflow.ts 와 같은 기준. */
const YT_ALIVE_LIFT = 1.3;
/** 매체 후보가 힘이 있다고 볼 최소 매체 수 — 한 곳만 쓴 말은 아직 신호가 아니다. */
const MEDIA_MIN_SOURCES = 2;

const norm = (s: string) => (s ?? "").replace(/^#/, "").trim().toLowerCase();

/** 매체 후보 중 랭킹에 넣을 것만 고른다 (새로 등장했거나 번지는 중). */
export function pickMediaTerms(terms: NewsTerm[]): NewsTerm[] {
  return terms.filter((t) => t.novelty === "new" || t.novelty === "rising");
}

/**
 * 두 소스를 하나의 후보 목록으로 합친다 (순수 함수 · 검증 대상).
 * 같은 말이 양쪽에 있으면 source="both" 로 묶고 두 소스의 근거를 모두 남긴다.
 */
export function mergeOverseasSources(
  youtube: DiscoverCandidate[],
  media: NewsTerm[],
): MergedCandidate[] {
  const byTerm = new Map<string, MergedCandidate>();

  for (const c of youtube) {
    byTerm.set(norm(c.term), {
      term: c.term.replace(/^#/, ""),
      source: "youtube",
      lift: c.lift ?? null,
      channels: c.dfRecent ?? null,
      mediaCount: null,
      novelty: null,
      sample: c.examples?.[0] ?? null,
      overseasAlive: (c.lift ?? 0) >= YT_ALIVE_LIFT,
    });
  }

  for (const t of pickMediaTerms(media)) {
    const key = norm(t.term);
    const mediaAlive = t.sources.length >= MEDIA_MIN_SOURCES;
    const existing = byTerm.get(key);
    if (existing) {
      existing.source = "both";
      existing.mediaCount = t.sources.length;
      existing.novelty = t.novelty;
      // 한쪽에서만 살아 있어도 해외에서는 힘이 있는 것으로 본다.
      existing.overseasAlive = existing.overseasAlive || mediaAlive;
      continue;
    }
    byTerm.set(key, {
      term: t.term,
      source: "media",
      lift: null,
      channels: null,
      mediaCount: t.sources.length,
      novelty: t.novelty,
      sample: t.sample ?? null,
      overseasAlive: mediaAlive,
    });
  }

  return [...byTerm.values()];
}

/** 배지 단위 — 화면에는 **소스마다 배지 하나씩** 붙인다. */
export type SourceBadge = "youtube" | "media";

export const BADGE_META: Record<SourceBadge, { label: string; desc: string }> = {
  youtube: { label: "유튜브", desc: "유튜브 콘텐츠에서 급증한 용어입니다." },
  media: { label: "뉴스", desc: "해외 식품 매체에 새로 등장했거나 여러 매체로 번지는 용어입니다." },
};

/**
 * 어떤 배지를 붙일지.
 * ⚠️ "양쪽" 이라는 별도 배지를 만들지 않는다 — 그러면 읽는 사람이 배지 이름과 소스 이름을
 *    따로 외워야 한다. 두 소스에서 잡혔으면 **배지 두 개를 나란히** 붙이는 편이 직관적이다.
 */
export function sourceBadges(source: OverseasSource): SourceBadge[] {
  if (source === "both") return ["youtube", "media"];
  return [source];
}

/** 정렬 보조 — 양쪽에서 잡힌 것을 같은 유입 상태 안에서 위로 올린다. */
export const SOURCE_RANK: Record<OverseasSource, number> = {
  both: 2,
  youtube: 1,
  media: 1,
};
