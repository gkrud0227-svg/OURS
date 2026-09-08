/** 협력 제조처 캐시 현황 — 식약처 호출 없이 저장된 것만 센다. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env" + ".local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
let url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
if (url.endsWith("/rest/v1")) url = url.slice(0, -"/rest/v1".length);
const sb = createClient(url, (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(), {
  auth: { persistSession: false },
});

const { data, error } = await sb.from("odm_cache").select("company,data,fetched_at");
if (error) {
  console.log(`읽기 실패: ${error.message}`);
  process.exit(1);
}

const rows = (data ?? []).map((r) => ({
  company: r.company,
  total: r.data?.total ?? r.data?.rows?.length ?? 0,
  at: r.fetched_at,
}));
rows.sort((a, b) => b.total - a.total);

const withData = rows.filter((r) => r.total > 0);
const empty = rows.filter((r) => r.total === 0);
const sum = rows.reduce((a, r) => a + r.total, 0);

console.log(`캐시된 업체   ${rows.length}곳`);
console.log(`  자료 있음   ${withData.length}곳`);
console.log(`  자료 0건    ${empty.length}곳${empty.length ? " — " + empty.map((r) => r.company).join(", ") : ""}`);
console.log(`제품 신고건수 총 ${sum.toLocaleString()}건`);
console.log(`\n상위 10곳:`);
for (const r of withData.slice(0, 10)) {
  console.log(`  ${r.company.padEnd(14)} ${String(r.total).padStart(5)}건`);
}

// 목록 대비 빠진 곳
try {
  const names = JSON.parse(readFileSync("scripts/_partners.json", "utf8"));
  const have = new Set(rows.map((r) => r.company));
  const missing = names.filter((n) => !have.has(n));
  const extra = rows.map((r) => r.company).filter((c) => !names.includes(c));
  console.log(`\n목록 ${names.length}곳 대비`);
  console.log(`  빠진 곳 ${missing.length}: ${missing.join(", ") || "없음"}`);
  if (extra.length) console.log(`  목록에 없는 캐시 ${extra.length}: ${extra.join(", ")}`);
} catch {
  /* 목록 파일 없음 */
}
