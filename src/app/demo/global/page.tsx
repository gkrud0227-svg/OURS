import { TierBand, rowClass } from "@/components/DemoTable";
import { OverseasPipeline } from "../OverseasPipeline";
import { DEMO_INFLOW_DESC, DEMO_OVERSEAS, DEMO_OVERSEAS_AT } from "@/lib/demo-data";
import { formatCount } from "@/lib/format";

export const metadata = { title: "크림보드 체험 · 해외 트렌드" };

/**
 * 체험용 해외 트렌드 — 읽기 전용.
 *
 * ⚠️ 해외는 국내와 티어 근거가 다르다. 국내 지표는 상승률(%)이라 추세 판정을 묶어 쓰지만,
 *    해외는 지표 자체가 급증 배수라 디자인 명세의 문턱(×4 이상 / ×2~4)을 그대로 쓴다.
 */
/**
 * 국내 표와 같은 규칙 — 넓은 화면에서만 격자, 휴대폰에서는 세로로 쌓는다.
 * ⚠️ 키워드가 순위 바로 뒤다. 먼저 읽혀야 하는 건 "무엇이" 뜨는가지 "얼마나" 가 아니다.
 */
const GRID =
  "grid grid-cols-[38px_1fr] gap-x-3 px-4 " +
  "lg:grid-cols-[44px_1fr_104px_170px_120px_104px] lg:items-center lg:gap-3";

export default function DemoGlobalPage() {
  const t1 = DEMO_OVERSEAS.filter((r) => r.tier === 1);
  const t2 = DEMO_OVERSEAS.filter((r) => r.tier === 2);

  return (
    <div>
      <div className="mb-4">
        <p className="cb-mono mb-[7px]">발굴 결과 · {DEMO_OVERSEAS_AT}</p>
        <h1 className="text-[28px] font-black leading-[1.08] tracking-[-0.04em] text-ink sm:text-[40px] sm:leading-[1.05] sm:tracking-[-0.045em]">
          해외 트렌드
        </h1>
        <OverseasPipeline />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 rounded-[5px] border-[1.5px] border-ink bg-surface px-4 py-[11px]">
        <span className="whitespace-nowrap text-[13px] text-ink">
          후보 <span className="cb-num text-[16px]">{DEMO_OVERSEAS.length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="h-[14px] w-px bg-divider" />
        <span className="whitespace-nowrap text-[13px] text-ink">
          신규 등장{" "}
          <span className="cb-num text-[16px]">{DEMO_OVERSEAS.filter((r) => r.novel).length}</span>
          <span className="text-[12px] text-ink-4">건</span>
        </span>
        <span className="ml-auto text-[12px] font-bold text-ink-3">US·GB · 콘텐츠 급상승</span>
      </div>

      <div className="mb-4 overflow-hidden rounded-[5px] border-2 border-ink">
        <div className={`${GRID} hidden bg-ink py-[9px] lg:grid`}>
          <span className="cb-th">#</span>
          <span className="cb-th">키워드</span>
          <span className="cb-th">급증 배수</span>
          <span className="cb-th">국내 유입</span>
          <span className="cb-th text-right">영상수 (채널)</span>
          <span className="cb-th text-right">조회수 (참고)</span>
        </div>

        <TierBand tier={1} label="TIER 1 · 크림 — ×4 이상" note={`${t1.length}건`} />
        {t1.map((r) => (
          <Row key={r.term} r={r} />
        ))}

        <TierBand tier={2} label="TIER 2 · 우선 — ×2~4" note={`${t2.length}건`} />
        {t2.map((r) => (
          <Row key={r.term} r={r} />
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        <b className="font-bold text-ink">급증 배수</b>는 영상 수가 아니라{" "}
        <b className="font-bold text-ink">채널 수</b>로 셉니다 — 한 채널이 같은 제목을 열 번
        올린 건 트렌드가 아니라 그 채널의 습관이고, 몇 개 채널로 번졌는지가 진짜 신호입니다.
        조회수는 순위에 넣지 않습니다. 조회수가 터진 영상은 대개 트렌드가 아니라 클릭베이트였습니다.
      </p>
    </div>
  );
}

function Row({ r }: { r: (typeof DEMO_OVERSEAS)[number] }) {
  const big = r.tier === 1;
  return (
    <div className={`${GRID} ${rowClass(r.tier)}`}>
      <span
        className={`cb-num self-start leading-none ${
          big ? "text-[24px] text-ink lg:text-[16px]" : "text-[20px] text-ink-3 lg:text-[14px] lg:!font-extrabold"
        }`}
      >
        {String(r.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <span
          className={big ? "text-[21px] font-black tracking-[-0.02em]" : "text-[16px] font-extrabold"}
        >
          {r.term}
        </span>
        {r.novel && (
          <span
            title="과거 3~12개월 표본엔 없다가 최근 처음 등장한 말입니다."
            className="ml-2 cursor-help rounded-[3px] bg-mutedbg px-2 py-[2px] text-[10.5px] font-bold text-ink-3"
          >
            신규 등장
          </span>
        )}
        <p className="mt-1 truncate text-[11px] text-ink-4" title={r.example}>
          예: {r.example}
        </p>
      </div>
      <span
        className={`cb-num col-start-2 mt-1.5 block whitespace-nowrap text-ink lg:col-start-auto lg:mt-0 ${
          big ? "text-[20px] tracking-[-0.03em]" : "text-[16px] tracking-[-0.02em]"
        }`}
      >
        ×{r.lift}
      </span>

      {/* 국내 유입 — 해외 화면의 결론. 한글 표기를 함께 보여야 무엇으로 조회했는지 보인다. */}
      <span
        className="col-start-2 mt-1.5 flex flex-wrap items-center gap-1.5 lg:col-start-auto lg:mt-0"
        title={DEMO_INFLOW_DESC[r.inflow]}
      >
        <span
          className={`cursor-help whitespace-nowrap rounded-[3px] px-2 py-[2px] text-[10.5px] font-extrabold ${
            r.inflow === "기회"
              ? "bg-ink text-on-dark"
              : r.inflow === "후보"
                ? "border-[1.5px] border-ink text-ink"
                : "bg-mutedbg text-ink-3"
          }`}
        >
          {r.inflow}
        </span>
        <span className="text-[11.5px] text-ink-3">{r.spelling}</span>
      </span>

      <div className="col-start-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-start-auto lg:mt-0 lg:contents">
        <span className="text-[11px] text-ink-4 lg:hidden">영상수(채널)</span>
        <span className="lg:text-right">
          <span className={`cb-num text-ink ${big ? "text-[15px]" : "text-[13px]"}`}>{r.videos}</span>
          <span className="ml-1 text-[11.5px] text-ink-4">({r.channels})</span>
        </span>
        <span className="text-[11px] text-ink-4 lg:hidden">조회수</span>
        <span className={`cb-num text-ink-3 lg:text-right ${big ? "text-[15px]" : "text-[13px]"}`}>
          {formatCount(r.views)}
        </span>
      </div>
    </div>
  );
}
