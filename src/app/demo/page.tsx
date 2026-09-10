import Link from "next/link";
import { Badge, StatusChip, TierBand, rowClass } from "@/components/DemoTable";
import { DEMO_DISCOVERED_AT, DEMO_DOMESTIC } from "@/lib/demo-data";

export const metadata = { title: "크림보드 체험 · 국내 트렌드" };

/**
 * 체험용 국내 트렌드 — 읽기 전용.
 *
 * 실제 화면과 다른 점은 딱 둘이다: **발굴 버튼이 없고**, 결과가 고정이다.
 * 나머지(티어 밴드·배지 규칙·수치 서체·괘선)는 전부 같은 규격이라, 체험한 사람이
 * 실제 화면을 봤을 때 다른 물건으로 느끼지 않는다.
 */
/**
 * 넓은 화면에서만 6열 격자를 쓴다.
 * ⚠️ 휴대폰에서는 격자를 버리고 세로로 쌓는다 — 6열을 390px 에 욱여넣으면 배수도 키워드도
 *    다 뭉개진다. 배너 QR 로 들어오는 사람은 대부분 휴대폰이라 이쪽이 기본 화면이다.
 */
const GRID =
  "lg:grid lg:grid-cols-[44px_120px_1fr_100px_120px_140px] lg:items-center lg:gap-3 px-4";

export default function DemoDomesticPage() {
  const t1 = DEMO_DOMESTIC.filter((r) => r.tier === 1);
  const t2 = DEMO_DOMESTIC.filter((r) => r.tier === 2);
  const maxScore = Math.max(...DEMO_DOMESTIC.map((r) => r.score));

  return (
    <div>
      <div className="mb-4">
        <p className="cb-mono mb-[7px]">발굴 결과 · {DEMO_DISCOVERED_AT}</p>
        <h1 className="text-[28px] font-black leading-[1.08] tracking-[-0.04em] text-ink sm:text-[40px] sm:leading-[1.05] sm:tracking-[-0.045em]">
          국내 트렌드
        </h1>
        <p className="mt-3 max-w-[760px] text-[12px] leading-relaxed text-ink-3">
          유튜브 콘텐츠에서 신조어를 발굴하고, 그 발굴어를{" "}
          <b className="font-bold text-ink">네이버 검색 자동완성으로 확장</b>한 뒤{" "}
          <b className="font-bold text-ink">데이터랩 검색 급상승으로 검증</b>합니다. 검색까지 오른
          키워드에 <b className="font-bold text-ink">쇼핑 클릭(구매 의향)</b>이 겹치면 가장 강한
          신호입니다.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 rounded-[5px] border-[1.5px] border-ink bg-surface px-4 py-[11px]">
        <span className="cb-mono">이 회차</span>
        <span className="whitespace-nowrap text-[13px] text-ink">
          검증 통과 <span className="cb-num text-[16px]">{DEMO_DOMESTIC.length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="h-[14px] w-px bg-divider" />
        <span className="whitespace-nowrap text-[13px] text-ink">
          즉시 검토 <span className="cb-num text-[16px]">{t1.length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="h-[14px] w-px bg-divider" />
        <span className="whitespace-nowrap text-[13px] text-ink">
          최고 발굴점수 <span className="cb-num text-[16px]">{maxScore}</span>
        </span>
        <span className="ml-auto text-[12px] font-bold text-ink-3">황치즈 정복 스낵 · SNS 핫키워드</span>
      </div>

      <div className="mb-4 overflow-hidden rounded-[5px] border-2 border-ink">
        <div className={`${GRID} hidden bg-ink py-[9px] lg:grid`}>
          <span className="cb-th">#</span>
          <span className="cb-th">상승률</span>
          <span className="cb-th">키워드</span>
          <span className="cb-th text-right">월 검색량</span>
          <span className="cb-th">상태</span>
          <span className="cb-th">발굴점수</span>
        </div>

        <TierBand tier={1} label="TIER 1 · 크림 — 급상승" note={`즉시 검토 ${t1.length}건`} />
        {t1.map((r) => (
          <Row key={r.name} r={r} maxScore={maxScore} />
        ))}

        <TierBand tier={2} label="TIER 2 · 우선 — 상승세" note={`${t2.length}건 · 다음 크림 후보`} />
        {t2.map((r) => (
          <Row key={r.name} r={r} maxScore={maxScore} />
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        <b className="font-bold text-ink">발굴점수</b> = 검색량 40% + 상승률 60% + 추세 패턴 보너스.
        정렬은 상승률 기준이고, 구매 의향(쇼핑)은 함께 표시만 하며 점수에는 넣지 않습니다.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3 rounded-[5px] border-[1.5px] border-ink bg-surface px-4 py-3.5">
        <span className="text-[13px] text-ink">
          이 키워드를 만들어 본 <b className="font-bold">제조처</b>는 직접 찾아볼 수 있습니다.
        </span>
        <Link
          href="/demo/odm"
          className="cb-row-hover ml-auto rounded-[4px] bg-ink px-4 py-2.5 text-[13px] font-extrabold text-on-dark hover:bg-ink-2"
        >
          제조처 스크리닝 열기
        </Link>
      </div>
    </div>
  );
}

function Row({ r, maxScore }: { r: (typeof DEMO_DOMESTIC)[number]; maxScore: number }) {
  const big = r.tier === 1;
  return (
    <div className={`${GRID} ${rowClass(r.tier)}`}>
      {/* 휴대폰: 순위와 상승률을 한 줄에 나란히. 넓은 화면: 각자 자기 열로. */}
      <div className="mb-1 flex items-baseline gap-3 lg:mb-0 lg:contents">
        <span
          className={`cb-num ${big ? "text-[16px] text-ink" : "text-[14px] !font-extrabold text-ink-3"}`}
        >
          {String(r.rank).padStart(2, "0")}
        </span>
        <span
          className={`cb-num whitespace-nowrap text-ink ${
            big ? "text-[24px] tracking-[-0.04em]" : "text-[18px] tracking-[-0.03em]"
          }`}
        >
          +{r.riseRate}%
        </span>
      </div>
      <div className="min-w-0">
        <span
          className={big ? "text-[19px] font-black tracking-[-0.02em]" : "text-[15.5px] font-extrabold"}
        >
          {r.name}
        </span>
        {r.badges.map((b) => (
          <Badge key={b} kind={b} />
        ))}
      </div>
      {/* 휴대폰: 검색량·상태·점수를 한 줄 메타로 묶는다. 넓은 화면: 각자 자기 열로. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:mt-0 lg:contents">
        <span className="text-[11px] text-ink-4 lg:hidden">월 검색량</span>
        <span
          className={`cb-num text-ink lg:text-right ${big ? "text-[15px]" : "text-[13px]"}`}
        >
          {r.volume.toLocaleString()}
        </span>
        <div className="flex items-center gap-1.5 lg:flex-col lg:items-start lg:gap-1">
          <StatusChip status={r.status} />
          <span
            className={`whitespace-nowrap text-[10.5px] font-semibold ${
              r.patternUp ? "text-rise-text" : "text-ink-3"
            }`}
          >
            {r.pattern}
          </span>
        </div>
        <div className="flex w-full items-center gap-2.5 lg:w-auto">
          <span className="text-[11px] text-ink-4 lg:hidden">발굴점수</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-mutedbg">
            <div
              className="h-full rounded-[3px] bg-rise"
              style={{ width: `${Math.round((r.score / maxScore) * 100)}%` }}
            />
          </div>
          <span className={`cb-num min-w-[24px] text-right ${big ? "text-[17px]" : "text-[15px]"}`}>
            {r.score}
          </span>
        </div>
      </div>
    </div>
  );
}

