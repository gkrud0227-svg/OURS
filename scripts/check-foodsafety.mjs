/**
 * 식품안전나라 I1250(식품(첨가물)품목제조보고) 복구 여부 점검.
 *
 * 2026-07-23 기준 이 서비스는 ERROR-500 을 반환한다. 공식 문서의 sample 예제
 * URL 로도 동일하게 재현되므로 우리 코드/키 문제가 아니다. 복구되면 코드 수정
 * 없이 바로 조회된다.
 *
 *   node scripts/check-foodsafety.mjs
 *
 * exit 0 = 복구됨, 1 = 아직 장애, 2 = 점검 자체 실패(네트워크 등)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const TIMEOUT_MS = 20_000;

/** .env.local 에서 키를 읽는다. 없으면 sample 로만 점검한다. */
function readLocalKey() {
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((l) => /^\s*FOODSAFETY_API_KEY\s*=/.test(l));
    if (!line) return null;
    const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

const mask = (k) => (k.length <= 6 ? "****" : `${k.slice(0, 4)}…${k.slice(-2)}`);

async function probe(key) {
  // AbortSignal.timeout 은 Windows 에서 미정리 핸들로 남아 종료 시 크래시한다.
  // 명시적으로 만들고 반드시 clearTimeout 한다.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let text;
  try {
    const res = await fetch(`${BASE}/${key}/I1250/json/1/5`, {
      cache: "no-store",
      signal: ac.signal,
    });
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  if (/인증키가 유효하지/.test(text)) return { state: "BAD_KEY", note: "인증키가 유효하지 않음" };

  let env;
  try {
    env = JSON.parse(text).I1250;
  } catch {
    return { state: "UNKNOWN", note: text.slice(0, 120).replace(/\s+/g, " ") };
  }

  const code = env?.RESULT?.CODE ?? "";
  const msg = env?.RESULT?.MSG ?? "";
  if (code.startsWith("ERROR-500")) return { state: "DOWN", note: `${code} ${msg}` };
  if (code.startsWith("INFO-000") || code.startsWith("INFO-200") || Array.isArray(env?.row)) {
    return { state: "UP", note: `총 ${env?.total_count ?? "?"}건, 응답 ${env?.row?.length ?? 0}행` };
  }
  return { state: "UNKNOWN", note: `${code} ${msg}`.trim() };
}

const LABEL = {
  UP: "✅ 복구됨",
  DOWN: "❌ 아직 장애",
  BAD_KEY: "⚠️  인증키 문제",
  UNKNOWN: "❓ 판단 불가",
};

const key = readLocalKey();
const targets = [{ name: "sample(공식 예제)", key: "sample" }];
if (key) targets.push({ name: `내 키 ${mask(key)}`, key });

const results = [];
for (const t of targets) {
  try {
    const r = await probe(t.key);
    results.push(r.state);
    console.log(`${LABEL[r.state].padEnd(12)} ${t.name.padEnd(22)} ${r.note}`);
  } catch (e) {
    results.push("ERR");
    console.log(`${"⚠️  점검실패".padEnd(12)} ${t.name.padEnd(22)} ${e.message}`);
  }
}

// 내 키가 있으면 그 결과가 기준. 없으면 sample 기준.
const verdict = results[results.length - 1];
if (verdict === "UP") {
  console.log("\n→ I1250 복구. ODM 스크리닝 탭에서 바로 조회됩니다.");
  process.exitCode = 0;
} else if (verdict === "DOWN") {
  const h = new Date().getHours();
  if (h >= 9 && h < 19) {
    console.log("\n→ 식약처 제한 운영 시간대입니다 (매일 09:00~19:00). 정상이며 코드/키 문제 아님.");
    console.log('  공지 "Open API 제한적 운영(\'26.7.7.~)" — 서버 불안정, 종료일 별도 공지.');
    console.log("  19시 이후에 다시 시도하세요.");
  } else {
    console.log("\n→ 제한 시간대가 아닌데도 오류입니다. 코드/키는 정상이니 그대로 두세요.");
    console.log("  지속되면 통합망 고객지원센터 1899-5590 문의.");
  }
  process.exitCode = 1;
} else {
  process.exitCode = verdict === "ERR" ? 2 : 1;
}
