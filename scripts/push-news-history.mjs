/**
 * 로컬 이력 파일 → Supabase news_history 로 한 번 올린다(초기 이관).
 *
 * 크론은 Vercel 에서 돌고 Vercel 은 파일을 못 쓰므로, 지금까지 로컬에 쌓인 기준선을
 * 한 번 올려두지 않으면 배포 후 첫 스캔에서 전부 new 가 된다.
 *
 *   node scripts/push-news-history.mjs [region] [--apply]
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const region = process.argv.find((a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1]) ?? "overseas";
const apply = process.argv.includes("--apply");

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// src/lib/supabase.ts 와 같은 정규화 — 끝 슬래시와 실수로 붙인 /rest/v1 을 벗긴다.
let url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
if (url.endsWith("/rest/v1")) url = url.slice(0, -"/rest/v1".length).replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) {
  console.log("Supabase 환경변수가 없습니다 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const file = join(process.cwd(), "data", `news-history-${region}.json`);
if (!existsSync(file)) {
  console.log(`이력 파일이 없습니다: ${file}`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8"));
console.log(`${region} 이력 ${Object.keys(data).length}개 (${(readFileSync(file).length / 1e6).toFixed(1)}MB)`);

const sb = createClient(url, key, { auth: { persistSession: false } });

const probe = await sb.from("news_history").select("region").limit(1);
if (probe.error) {
  console.log(`\n테이블이 아직 없습니다: ${probe.error.message}`);
  console.log("supabase/migrations/0006_news_history.sql 을 Supabase SQL Editor 에서 먼저 실행하세요.");
  process.exit(2);
}
console.log("테이블 확인됨.");

if (!apply) {
  console.log("(미적용 — 실제로 올리려면 --apply)");
  process.exit(0);
}

const { error } = await sb
  .from("news_history")
  .upsert({ region, data, fetched_at: new Date().toISOString() }, { onConflict: "region" });
if (error) {
  console.log(`업로드 실패: ${error.message}`);
  process.exit(1);
}
const back = await sb.from("news_history").select("data").eq("region", region).maybeSingle();
console.log(`업로드 완료 — 되읽은 용어 수 ${Object.keys(back.data?.data ?? {}).length}개`);
