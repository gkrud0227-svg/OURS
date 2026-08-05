/**
 * ODM 후보 업체를 미리 조회해 로컬 캐시에 저장한다.
 *
 * 식약처가 Open API를 매일 09:00~19:00 제한 운영 중이라( '26.7.7.~, 종료일 미정 )
 * 업무시간에는 조회가 안 된다. 그래서 밤에 미리 받아두고, 낮에는 /api/odm 이
 * 이 캐시로 폴백해 보여준다.
 *
 *   node scripts/fetch-odm-cache.mjs                 # 기본 업체 목록
 *   node scripts/fetch-odm-cache.mjs 디엔비 영의정    # 지정한 업체만
 *
 * 원본 응답(row)을 그대로 저장한다. 필드 매핑은 /api/odm 라우트 한 곳에만 두어
 * 캐시와 실시간 조회가 갈라지지 않게 한다.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = join(ROOT, "data", "odm-cache.json");
const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I1250";
const CHUNK = 1000; // 식품안전나라 1회 최대 건수
const MAX_ROWS = 5000; // 업체당 상한
const TIMEOUT_MS = 30_000;

/**
 * 기본 조회 대상.
 * "삼립"은 일부러 넓게 잡는다 — 삼립식품/에스피씨삼립 등 상호 변경과
 * 대구·성남·시화 공장이 상호에 붙어 나오는 경우를 한 번에 걷기 위해서다.
 */
const DEFAULT_QUERIES = [
  "디엔비",
  "리빙라이프",
  "비엘에프씨",
  "삼립",
  "엠에스씨",
  "영의정",
  "유성씨앤에프",
];

function readKey() {
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((l) => /^\s*FOODSAFETY_API_KEY\s*=/.test(l));
    if (!line) return null;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    const text = await res.text();
    if (/인증키가 유효하지/.test(text)) return { fatal: "인증키가 유효하지 않습니다." };
    try {
      return { env: JSON.parse(text)[SERVICE] };
    } catch {
      return { fatal: `응답 해석 실패: ${text.slice(0, 100).replace(/\s+/g, " ")}` };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** 업체명 하나를 페이징하며 전부 받아온다. */
async function fetchCompany(key, company) {
  const rows = [];
  let total = 0;

  for (let start = 1; start <= MAX_ROWS; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, MAX_ROWS);
    const url = `${BASE}/${key}/${SERVICE}/json/${start}/${end}/BSSH_NM=${encodeURIComponent(company)}`;
    const { env, fatal } = await getJson(url);
    if (fatal) return { error: fatal };

    const code = env?.RESULT?.CODE ?? "";
    const msg = env?.RESULT?.MSG ?? "";
    if (code.startsWith("ERROR-500")) {
      return { error: `ERROR-500 ${msg} (제한 시간대 09:00~19:00 로 추정)` };
    }
    if (code.startsWith("INFO-200")) break; // 데이터 없음
    if (code && !code.startsWith("INFO-000")) return { error: `${code} ${msg}` };

    total = Number(env?.total_count ?? 0) || total;
    const batch = env?.row ?? [];
    rows.push(...batch);
    if (batch.length < end - start + 1 || rows.length >= total) break;
  }

  return { total: total || rows.length, rows };
}

const queries = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_QUERIES;

const key = readKey();
if (!key) {
  console.error("FOODSAFETY_API_KEY 를 .env.local 에서 찾지 못했습니다.");
  process.exitCode = 2;
} else {
  const hour = new Date().getHours();
  if (hour >= 9 && hour < 19) {
    console.log("⚠️  지금은 식약처 제한 시간대(09:00~19:00)입니다. 실패할 수 있습니다.\n");
  }

  // 기존 캐시를 이어받아, 이번에 실패한 업체는 예전 데이터를 잃지 않게 한다.
  let cache = { fetchedAt: null, queries: {} };
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
      cache.queries ??= {};
    } catch {
      /* 깨진 캐시는 새로 만든다 */
    }
  }

  let ok = 0;
  let failed = 0;

  for (const q of queries) {
    process.stdout.write(`${q.padEnd(12)} `);
    try {
      const r = await fetchCompany(key, q);
      if (r.error) {
        failed++;
        console.log(`❌ ${r.error}`);
        continue;
      }
      // 실제로 잡힌 상호들 — 공장별로 어떤 이름으로 등록돼 있는지 확인용
      const names = [...new Set(r.rows.map((x) => (x.BSSH_NM ?? "").trim()).filter(Boolean))];
      cache.queries[q] = {
        total: r.total,
        rows: r.rows,
        fetchedAt: new Date().toISOString(),
        companies: names,
      };
      ok++;
      console.log(`✅ ${String(r.total).padStart(5)}건 · 업체 ${names.length}곳`);
      for (const n of names.slice(0, 12)) console.log(`${" ".repeat(15)}· ${n}`);
      if (names.length > 12) console.log(`${" ".repeat(15)}… 외 ${names.length - 12}곳`);
    } catch (e) {
      failed++;
      console.log(`❌ ${e.message}`);
    }
  }

  if (ok > 0) {
    cache.fetchedAt = new Date().toISOString();
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
    console.log(`\n저장: data/odm-cache.json (성공 ${ok} / 실패 ${failed})`);
    console.log("내일 낮에는 ODM 탭이 이 캐시로 자동 폴백합니다.");
  } else {
    console.log(`\n저장할 데이터가 없습니다 (실패 ${failed}). 19시 이후에 다시 시도하세요.`);
    process.exitCode = 1;
  }
}
