/**
 * 식약처 I1250 의 CHNG_DT(변경일자) 조회가 실제로 되는지 확인한다.
 *
 * 확인하려는 것 셋:
 *   1) 업체 지정 없이 "그날 바뀐 것 전부"를 받을 수 있는가
 *   2) 하루치가 몇 건인가 (페이징이 필요한 규모인가)
 *   3) 시간당 호출 한도(INFO-320)를 우회하는가 — 지금 한도에 걸린 상태라 바로 판별된다
 *
 *   node scripts/probe-chngdt.mjs [YYYYMMDD ...]
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env" + ".local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const key = (process.env.FOODSAFETY_API_KEY ?? "").trim();
if (!key) {
  console.log("FOODSAFETY_API_KEY 가 없습니다.");
  process.exit(1);
}

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const dates = process.argv.slice(2);
if (!dates.length) {
  const now = new Date(Date.now() + 9 * 3600e3); // KST 기준 날짜
  for (let back = 1; back <= 3; back += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    dates.push(ymd(d));
  }
}

async function call(path, label) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}/${key}/I1250/json/${path}`, { cache: "no-store", signal: ac.signal });
    const json = await res.json();
    const env = json?.I1250 ?? json;
    const code = env?.RESULT?.CODE ?? json?.RESULT?.CODE ?? "(코드없음)";
    const msg = env?.RESULT?.MSG ?? json?.RESULT?.MSG ?? "";
    const total = Number(env?.total_count ?? 0) || 0;
    const rows = env?.row ?? [];
    console.log(`${label.padEnd(28)} ${code} · total ${total} · row ${rows.length} ${msg ? "· " + msg : ""}`);
    return { code, total, rows };
  } catch (e) {
    console.log(`${label.padEnd(28)} 실패: ${e.message}`);
    return { code: "EXCEPTION", total: 0, rows: [] };
  } finally {
    clearTimeout(timer);
  }
}

console.log("=== 1) CHNG_DT 단독 조회 (업체 지정 없음) ===");
let sample = null;
for (const d of dates) {
  const r = await call(`1/5/CHNG_DT=${d}`, `CHNG_DT=${d}`);
  if (!sample && r.rows.length) sample = { date: d, row: r.rows[0], total: r.total };
}

console.log("\n=== 2) 비교: CHNG_DT 없는 평범한 조회 (한도 확인용) ===");
await call(`1/5/BSSH_NM=${encodeURIComponent("삼립")}`, "BSSH_NM=삼립");

if (sample) {
  console.log(`\n=== 3) 응답 행 구조 (${sample.date}, 하루 ${sample.total}건) ===`);
  const keys = Object.keys(sample.row);
  console.log(`필드 ${keys.length}개: ${keys.join(", ")}`);
  console.log("\n첫 행 주요값:");
  for (const k of ["PRDLST_REPORT_NO", "BSSH_NM", "PRDLST_NM", "PRDLST_DCNM", "CHNG_DT", "PRMS_DT"]) {
    if (k in sample.row) console.log(`  ${k.padEnd(18)} ${sample.row[k]}`);
  }
}
