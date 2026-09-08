/**
 * 일일 변경분 병합 로직 검증 (외부 호출 없음).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/odm-delta-check.mjs
 */
import { groupByPartner, mergeRows, kstYmd, nextYmd } from "../src/lib/odm-delta.ts";

let fail = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fail += 1;
};

// ── 거래처 가르기 ─────────────────────────────────────────
const PARTNERS = ["삼립", "한우물", "사조해표"];
const ALIASES = { 사조해표: ["사조해표", "해표"] };
const row = (no, bssh, nm = "제품") => ({ PRDLST_REPORT_NO: no, BSSH_NM: bssh, PRDLST_NM: nm });

const g = groupByPartner(
  [
    row("1", "에스피씨삼립(주) 대구공장"), // 부분 매칭이라 잡혀야 한다
    row("2", "(주)한우물"),
    row("3", "한국에스비식품(주)"), // 우리 거래처 아님
    row("4", "사조해표(주)"),
    row("5", "해표산업"), // 별칭으로 잡힌다
    row("6", ""), // 업체명 없음 — 버린다
  ],
  PARTNERS,
  ALIASES,
);
ok("긴 등록명도 부분 매칭으로 잡는다", g.get("삼립")?.length === 1);
ok("괄호 붙은 이름도 잡는다", g.get("한우물")?.length === 1);
ok("거래처 아닌 곳은 안 잡는다", ![...g.values()].flat().some((r) => r.BSSH_NM === "한국에스비식품(주)"));
ok("별칭으로도 잡는다(사조해표 2건)", g.get("사조해표")?.length === 2);
ok("업체명 없는 행은 버린다", [...g.values()].flat().every((r) => r.BSSH_NM));

// 한 행이 두 거래처에 중복으로 들어가지 않는다
const g2 = groupByPartner([row("7", "우양식품")], ["우양", "우양식품"], {});
ok("한 행은 한 거래처에만 들어간다", [...g2.values()].flat().length === 1);

// ── 병합 ──────────────────────────────────────────────────
const existing = [row("100", "삼립", "옛날식빵"), row("101", "삼립", "크림빵")];
const m = mergeRows(existing, [
  row("101", "삼립", "크림빵(개정)"), // 기존 갱신
  row("102", "삼립", "신제품"), // 신규
]);
ok("신규는 추가된다", m.added === 1);
ok("기존은 갱신된다", m.updated === 1);
ok("전체 행 수는 3", m.rows.length === 3);
ok("갱신된 값이 반영된다", m.rows.find((r) => r.PRDLST_REPORT_NO === "101")?.PRDLST_NM === "크림빵(개정)");
ok("원본 배열을 건드리지 않는다", existing.length === 2 && existing[1].PRDLST_NM === "크림빵");

// 같은 것을 두 번 병합해도 늘지 않는다(크론 재실행 안전)
const twice = mergeRows(m.rows, [row("102", "삼립", "신제품")]);
ok("재실행해도 중복이 안 생긴다", twice.rows.length === 3 && twice.added === 0);

// 보고번호 없는 행은 버린다 — 갱신인지 신규인지 알 수 없다
const noNo = mergeRows(existing, [{ BSSH_NM: "삼립", PRDLST_NM: "번호없음" }]);
ok("보고번호 없는 행은 버린다", noNo.rows.length === 2 && noNo.added === 0);

// ── 날짜 ──────────────────────────────────────────────────
ok("오늘은 YYYYMMDD 8자리", /^\d{8}$/.test(kstYmd()));
ok("어제는 오늘보다 작다", kstYmd(-1) < kstYmd());
ok("다음 날 계산", nextYmd("20260907") === "20260908");
ok("월말을 넘긴다", nextYmd("20260131") === "20260201");
ok("연말을 넘긴다", nextYmd("20261231") === "20270101");
ok("윤년 2월을 넘긴다", nextYmd("20280228") === "20280229");

console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
