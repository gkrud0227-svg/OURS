/**
 * 협력 제조처 캐시를 다 찰 때까지 크론을 반복 호출한다.
 *
 * 왜 반복인가: /api/odm-cron 은 Vercel Hobby 60초 제한에 맞춰 **50초 예산**만 쓰고 멈춘다
 * (한 번에 2~5곳). 63곳을 채우려면 여러 번 이어 돌려야 한다. 크론은 fetchedAt 이 오래된
 * 순으로 도니, 그냥 다시 부르면 남은 곳부터 이어 간다.
 *
 * ⚠️ 식약처는 09:00~19:00 KST 실시간 조회를 막는다. 그 시간대엔 아무리 돌려도 안 찬다.
 * ⚠️ 시간당 호출 상한(100회)도 있다. 진전이 없으면 멈춘다 — 벽에 부딪힌 것이다.
 *
 *   node scripts/fill-odm-cache.mjs [기준주소=http://localhost:3000]
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const MAX_ROUNDS = 30;

const kst = () => {
  const d = new Date(Date.now() + 9 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

let prevCached = -1;
let stagnant = 0;
const allFailed = new Set();

for (let round = 1; round <= MAX_ROUNDS; round += 1) {
  let r;
  try {
    r = await (await fetch(`${BASE}/api/odm-cron`, { cache: "no-store" })).json();
  } catch (e) {
    console.log(`${round}회차 · 요청 실패: ${e.message}`);
    break;
  }
  if (r.error) {
    console.log(`${round}회차 · 오류: ${r.error}`);
    break;
  }
  for (const f of r.failed ?? []) allFailed.add(f);
  console.log(
    `${String(round).padStart(2)}회차 [${kst()} KST] 캐시 ${r.cached}/${r.partners} ` +
      `· 이번 ${r.updated}곳${r.done?.length ? " (" + r.done.join(", ") + ")" : ""}` +
      `${r.failed?.length ? " · 실패 " + r.failed.join(", ") : ""}`,
  );

  if (r.cached >= r.partners) {
    console.log("\n전부 채웠습니다.");
    break;
  }
  // 진전이 없으면(캐시 수 그대로 + 이번에 갱신 0) 두 번까지만 더 시도한다.
  if (r.cached === prevCached && !r.updated) {
    stagnant += 1;
    if (stagnant >= 2) {
      console.log("\n두 번 연속 진전이 없어 멈춥니다 — 남은 곳은 식약처에 자료가 없거나 업체명이 다릅니다.");
      break;
    }
  } else {
    stagnant = 0;
  }
  prevCached = r.cached;
}

if (allFailed.size) {
  console.log(`\n계속 실패한 곳(${allFailed.size}): ${[...allFailed].join(", ")}`);
}
