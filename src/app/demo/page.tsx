import Link from "next/link";
import { TierBand } from "@/components/DemoTable";
import { DomesticRows } from "./DomesticRows";
import { DEMO_DOMESTIC, DEMO_DOMESTIC_AT } from "@/lib/demo-data";

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
        <p className="cb-mono mb-[7px]">발굴 결과 · {DEMO_DOMESTIC_AT}</p>
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
        <span className="whitespace-nowrap text-[13px] text-ink">
          검증 통과 <span className="cb-num text-[16px]">{DEMO_DOMESTIC.length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="h-[14px] w-px bg-divider" />
        <span className="whitespace-nowrap text-[13px] text-ink">
          즉시 검토 <span className="cb-num text-[16px]">{t1.length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="ml-auto text-[12px] font-bold text-ink-3">민음사빵 · 군위사과 · 요거트찹쌀떡</span>
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
        <DomesticRows rows={t1} maxScore={maxScore} />

        <TierBand tier={2} label="TIER 2 · 우선 — 상승세" note={`${t2.length}건 · 다음 크림 후보`} />
        <DomesticRows rows={t2} maxScore={maxScore} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border-[1.5px] border-ink bg-surface px-4 py-3">
        <span className="cb-mono">배지 뜻</span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="rounded-[3px] bg-rise px-2 py-[2px] text-[10.5px] font-extrabold text-ink">
            검색량 확인
          </span>
          상승이 실제 검색량으로 뒷받침됨
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="rounded-[3px] bg-mutedbg px-2 py-[2px] text-[10.5px] font-extrabold text-ink-3">
            검색량 미확인
          </span>
          너무 새 말이라 아직 검색량 집계 전
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="rounded-[3px] bg-rise px-2 py-[2px] text-[10.5px] font-extrabold text-ink">
            구매 상승
          </span>
          쇼핑 클릭까지 함께 오름
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="rounded-[3px] bg-ink px-2 py-[2px] text-[10.5px] font-extrabold text-on-dark">
            유튜브+검색
          </span>
          두 소스에서 함께 잡힘
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        <b className="font-bold text-ink">발굴점수</b> = 검색량 40% + 상승률 60% + 추세 패턴 보너스.
        정렬은 발굴점수 기준이고, 구매 의향(쇼핑)은 함께 표시만 하며 점수에는 넣지 않습니다.{" "}
        <b className="font-bold text-ink">키워드를 누르면</b> 그 키워드가 나온 인기 영상의 시청자
        댓글에서 집계한 <b className="font-bold text-ink">확산 이유</b>가 펼쳐집니다.
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
