/**
 * 해외 파이프라인 도식 — 문단으로 쓰여 있던 설명을 4단계로 편다.
 *
 * ⚠️ 처음엔 "해외는 검색 검증을 못 한다"고 그렸다가 **틀려서 고쳤다**. 실제 대시보드는
 *    해외 후보를 국내 검색으로 검증한다 — 영어 낱말을 한글 표기로 바꿔(네이버 백과·
 *    지식iN) 데이터랩에 물어보고 `기회 / 후보 / 성숙` 으로 나눈다. 옛 설명 문구가
 *    실제 화면에 남아 있어 그걸 그대로 옮긴 게 원인이었다. 화면 문구를 근거로 삼지 말 것.
 *
 * ⚠️ 그린은 마지막 칸(판정)에만. 앞의 셋은 재료를 만드는 단계다.
 * ⚠️ 휴대폰은 국내 도식과 같은 규칙 — 설명 줄을 빼고 출처+동작만 남겨 높이를 줄인다.
 *    도식이 첫 화면을 다 먹으면 정작 봐야 할 랭킹이 스크롤 아래로 밀린다.
 */
const STEPS = [
  {
    source: "YOUTUBE",
    short: "유튜브",
    shortTitle: "급증",
    title: "해외 급증 포착",
    desc: "최근 14일 이 말을 쓴 채널이 몇 배 늘었나",
  },
  {
    source: "네이버 백과·지식iN",
    short: "표기 변환",
    shortTitle: "한글로",
    title: "한글 표기 찾기",
    desc: "한국인이 실제로 쓰는 음차를 찾는다",
  },
  {
    source: "NAVER 데이터랩",
    short: "데이터랩",
    shortTitle: "국내 검색",
    title: "국내 검색 확인",
    desc: "그 표기로 국내에서 찾는지 본다",
  },
  {
    source: "유입 판정",
    short: "판정",
    shortTitle: "판정",
    title: "기회 · 후보 · 성숙",
    desc: "지금 움직일지 지켜볼지 가른다",
  },
];

export function OverseasPipeline() {
  return (
    <div className="mt-3 rounded-[5px] border-[1.5px] border-ink bg-surface px-3 py-3 sm:px-4 sm:py-4">
      <p className="cb-mono mb-2 sm:mb-3">해외 → 국내 유입 판정</p>

      {/* 휴대폰 — 출처+동작만. */}
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

      {/* 넓은 화면 — 한 줄 설명까지. */}
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
        해외 상승만으로는 기획 근거가 안 됩니다. <b className="font-bold text-ink">국내에 왔는지</b>를
        같이 봐야 지금 움직일 대상인지 알 수 있습니다.
      </p>
    </div>
  );
}
