/**
 * 전향적 발굴 로그 리포트 (쿼터 0).
 *
 * data/discovery-log.json 을 읽어 출처별 분포와 "자동완성이 최초로 잡은" 후보를 보여준다.
 * 발굴을 몇 번 돌린 뒤 이걸로 "자동완성 확장이 무엇을 추가했나"를 눈으로 확인하고,
 * 시간이 지나면 각 후보의 firstSeenAt 이후 데이터랩 급상승 여부로 정밀도를 측정한다.
 *
 * 사용법: node scripts/discovery-log-report.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
  join(ROOT, "data", "discovery-log.json"),
  join(ROOT, "trend-dashboard", "data", "discovery-log.json"),
];

let entries = [];
for (const p of paths) {
  try {
    entries = JSON.parse(readFileSync(p, "utf8")).entries ?? [];
    break;
  } catch {
    /* 다음 경로 */
  }
}

if (!entries.length) {
  console.log("아직 로그가 없습니다. 발굴을 한 번 이상 돌리면 채워집니다.");
  process.exit(0);
}

const bySource = {};
for (const e of entries) bySource[e.source ?? "unknown"] = (bySource[e.source ?? "unknown"] ?? 0) + 1;

const first = entries[0]?.firstSeenAt ?? "?";
const last = entries[entries.length - 1]?.firstSeenAt ?? "?";
console.log(`전향적 발굴 로그 · 총 ${entries.length}개 후보 · ${first} ~ ${last}`);
console.log("출처 분포:", JSON.stringify(bySource));
console.log("");

// 자동완성이 붙인 것(순수 검색 출처 + 유튜브·자동완성 둘 다)을 강조 — 이게 이 로그의 관심사.
const acFirst = entries.filter((e) => e.source === "search" || e.source === "both");
console.log(`자동완성 확장이 잡은 후보: ${acFirst.length}개`);
for (const e of acFirst) {
  const rise = e.riseRate != null ? `${e.riseRate > 0 ? "+" : ""}${Math.round(e.riseRate)}%` : "—";
  const shop = e.shopRise != null ? ` · 쇼핑 ${e.shopRise > 0 ? "+" : ""}${Math.round(e.shopRise)}%` : "";
  console.log(`  · ${e.term}  [${e.source}]  최초 ${e.firstSeenAt?.slice(0, 10)}  검색 ${rise}${shop}`);
}
console.log("");
console.log("※ 며칠~몇 주 뒤 각 후보의 firstSeenAt 대비 검색 급상승 여부를 데이터랩으로 재측정하면");
console.log("  자동완성 확장의 '전향적 정밀도'(look-ahead 편향 없음)가 나옵니다.");
