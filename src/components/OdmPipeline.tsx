/**
 * 제조처 스크리닝 도식 — 머리말 문단을 3단계로 편다.
 *
 * 원래는 "국내 식품 제조사가 의무 제출하는 품목제조보고 이력을 조회합니다…" 로 시작하는
 * 세 줄짜리 문단이었는데, **아무도 안 읽는다**(실사용 피드백). 이 화면이 하는 일은
 * `검색 → 이력 확인 → 컨택` 이라는 절차라, 문장보다 칸으로 놓는 편이 빨리 읽힌다.
 *
 * ⚠️ 그린은 마지막 칸에만. 앞의 둘은 재료를 모으는 단계고 마지막이 결과다.
 * ⚠️ 휴대폰은 설명 줄을 빼고 출처+동작만 남긴다 — 도식이 첫 화면을 다 먹으면
 *    정작 봐야 할 검색·후보 목록이 스크롤 아래로 밀린다.
 *    (`Pipeline` / `OverseasPipeline` 과 같은 규칙)
 */
const STEPS = [
  {
    source: "제품명 · 업체명 · 식품유형",
    short: "검색",
    shortTitle: "검색",
    title: "3가지로 찾기",
    desc: "만들려는 것과 비슷한 품목을 찾는다",
  },
  {
    source: "식품안전나라",
    short: "품목제조보고",
    shortTitle: "이력",
    title: "제조 이력 확인",
    desc: "의무 제출 기록이라 빠짐이 적다",
  },
  {
    source: "컨택 후보",
    short: "컨택",
    shortTitle: "컨택",
    title: "만들어본 곳만",
    desc: "전화 전에 걸러 헛걸음을 줄인다",
  },
];

export function OdmPipeline() {
  return (
    <div className="mt-3 rounded-[5px] border-[1.5px] border-ink bg-surface px-3 py-3 sm:px-4 sm:py-4">
      <p className="cb-mono mb-2 sm:mb-3">제조처 찾는 순서</p>

      {/* 휴대폰 — 출처+동작만. */}
      <div className="flex flex-wrap items-stretch gap-1 lg:hidden">
        {STEPS.map((s, i) => (
          <div key={s.source} className="contents">
            <div
              className={`min-w-0 flex-1 rounded-[4px] border-[1.5px] border-ink px-2 py-1.5 ${
                i === STEPS.length - 1 ? "bg-rise" : "bg-row1"
              }`}
            >
              <div className="flex items-baseline gap-1">
                <span className="cb-num text-[11px] text-ink-4">{i + 1}</span>
                <span
                  className={`cb-mono !text-[9px] !tracking-[0.06em] ${
                    i === STEPS.length - 1 ? "!text-rise-ink" : "!text-ink-4"
                  }`}
                >
                  {s.short}
                </span>
              </div>
              <p className="text-[12.5px] font-extrabold leading-tight text-ink">{s.shortTitle}</p>
            </div>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="flex shrink-0 items-center text-[11px] font-bold text-ink-4">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 넓은 화면 — 한 줄 설명까지. */}
      <div className="hidden lg:flex lg:items-stretch">
        {STEPS.map((s, i) => (
          <div key={s.source} className="contents">
            <div
              className={`flex-1 rounded-[4px] border-[1.5px] border-ink px-3 py-2.5 ${
                i === STEPS.length - 1 ? "bg-rise" : "bg-row1"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`cb-num text-[13px] ${i === 0 ? "text-ink-4" : "text-ink"}`}
                >
                  {i + 1}
                </span>
                <span
                  className={`cb-mono !text-[9.5px] !tracking-[0.1em] ${
                    i === STEPS.length - 1 ? "!text-rise-ink" : "!text-ink-4"
                  }`}
                >
                  {s.source}
                </span>
              </div>
              <p className="text-[14px] font-extrabold leading-tight text-ink">{s.title}</p>
              <p
                className={`mt-1 text-[11px] leading-snug ${
                  i === STEPS.length - 1 ? "text-rise-ink" : "text-ink-3"
                }`}
              >
                {s.desc}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center px-2 text-[13px] font-bold text-ink-4"
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
