/**
 * 발굴 파이프라인 도식 — 문단으로 쓰여 있던 설명을 4단계로 편다.
 *
 * 원래는 "유튜브에서 발굴 → 자동완성으로 확장 → 데이터랩으로 검증 → 쇼핑까지 겹치면
 * 가장 강한 신호" 를 한 문단에 욱여넣었는데, 이건 **순서가 있는 절차**라 문장으로
 * 읽으면 몇 단계인지·무엇이 무엇을 거르는지가 안 잡힌다.
 *
 * ⚠️ 그린은 마지막 칸에만 쓴다. 앞의 둘은 **후보를 모으는** 단계이고 뒤의 둘이
 *    **걸러내는** 단계라, 색이 그 경계를 말하게 한다.
 * ⚠️ 휴대폰과 넓은 화면의 **정보량이 다르다**. 넓은 화면은 한 줄 설명까지 붙이지만,
 *    휴대폰에서 같은 걸 세로로 쌓으면 도식만으로 첫 화면을 다 먹어 **정작 봐야 할
 *    랭킹이 스크롤 아래로 밀린다**(실사용 피드백). 휴대폰은 출처+동작만 남긴 칩으로
 *    접어 높이를 1/3 로 줄인다.
 */
/*
 * ⚠️ 휴대폰용 제목(shortTitle)을 따로 둔다. 390px 에서 한 칸에 들어가는 폭은 5자
 *    남짓이라 "검색어로 확장" 같은 제목은 잘린다(실측: scrollWidth > clientWidth).
 *    출처 라벨이 바로 위에 있으므로 "자동완성 · 확장" 처럼 둘이 짝으로 읽힌다.
 */
const STEPS = [
  { source: "YOUTUBE", short: "유튜브", shortTitle: "발굴", title: "신조어 발굴", desc: "콘텐츠 제목에서 처음 보는 말을 줍는다" },
  { source: "NAVER 자동완성", short: "자동완성", shortTitle: "확장", title: "검색어로 확장", desc: "사람들이 실제로 치는 말로 넓힌다" },
  { source: "NAVER 데이터랩", short: "데이터랩", shortTitle: "검증", title: "급상승 검증", desc: "정말 오르는 말만 남긴다" },
  { source: "NAVER 쇼핑", short: "쇼핑", shortTitle: "구매", title: "구매 확인", desc: "사려는 데까지 이어지면 가장 강하다" },
];

export function Pipeline() {
  return (
    <div className="mt-3 rounded-[5px] border-[1.5px] border-ink bg-surface px-3 py-3 sm:px-4 sm:py-4">
      <p className="cb-mono mb-2 sm:mb-3">발굴 파이프라인</p>

      {/* 휴대폰 — 출처+동작만. 설명은 뺀다(높이가 곧 랭킹을 밀어낸다). */}
      <div className="flex flex-wrap items-stretch gap-1 lg:hidden">
        {STEPS.map((s, i) => (
          <div key={s.source} className="contents">
            <div
              className={`min-w-0 flex-1 rounded-[4px] border-[1.5px] border-ink px-2 py-1.5 ${
                i === 3 ? "bg-rise" : "bg-row1"
              }`}
            >
              <div className="flex items-baseline gap-1">
                <span className="cb-num text-[11px] text-ink-4">{i + 1}</span>
                <span
                  className={`cb-mono !text-[9px] !tracking-[0.06em] ${
                    i === 3 ? "!text-rise-ink" : "!text-ink-4"
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

      {/* 넓은 화면 — 한 줄 설명까지 붙인다. */}
      <div className="hidden lg:flex lg:items-stretch">
        {STEPS.map((s, i) => (
          <div key={s.source} className="contents">
            <div
              className={`flex-1 rounded-[4px] border-[1.5px] border-ink px-3 py-2.5 ${
                i === 3 ? "bg-rise" : "bg-row1"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`cb-num text-[13px] ${i < 2 ? "text-ink-4" : "text-ink"}`}>
                  {i + 1}
                </span>
                <span
                  className={`cb-mono !text-[9.5px] !tracking-[0.1em] ${
                    i === 3 ? "!text-rise-ink" : "!text-ink-4"
                  }`}
                >
                  {s.source}
                </span>
              </div>
              <p className="text-[14px] font-extrabold leading-tight text-ink">{s.title}</p>
              <p className={`mt-1 text-[11px] leading-snug ${i === 3 ? "text-rise-ink" : "text-ink-3"}`}>
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

      <p className="mt-2 text-[11px] leading-snug text-ink-3 sm:mt-3 sm:text-[11.5px] sm:leading-relaxed">
        앞의 둘은 <b className="font-bold text-ink">모으는</b> 단계, 뒤의 둘은{" "}
        <b className="font-bold text-ink">거르는</b> 단계입니다. 4단계까지 통과하면{" "}
        <span className="whitespace-nowrap rounded-[3px] bg-rise px-1.5 py-[1px] text-[10.5px] font-extrabold text-ink">
          구매 상승
        </span>{" "}
        배지가 붙습니다.
      </p>
    </div>
  );
}
