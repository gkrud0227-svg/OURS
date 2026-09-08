/**
 * 미판정 발굴 로그를 전부 라벨링한다 — 배치로 나눠 이어 돈다.
 *
 * 왜 스크립트인가: 데이터랩을 term 마다 단독 조회해야 해서 건당 4초쯤 걸린다.
 * 405건이면 약 27분인데, 서버리스 함수는 60초에서 끊긴다. 로컬에서 배치로 돌려
 * 결과를 Supabase 에 눌러 담고, 화면은 그 저장된 값을 즉시 읽는다.
 *
 * 중간에 끊겨도 안전하다 — 배치마다 저장하므로 다시 돌리면 남은 것부터 이어 간다.
 *
 *   node scripts/label-all.mjs [배치크기=25] [기준주소=http://localhost:3000]
 */

const BATCH = Number(process.argv[2] ?? 25);
const BASE = process.argv[3] ?? "http://localhost:3000";

const pad = (n, w = 3) => String(n).padStart(w);
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
};

const started = Date.now();
let round = 0;
let done = 0;

for (;;) {
  round += 1;
  const t = Date.now();
  let r;
  try {
    const res = await fetch(`${BASE}/api/discovery-label?batch=${BATCH}`, { cache: "no-store" });
    r = await res.json();
  } catch (e) {
    console.log(`${pad(round)}회차 · 요청 실패: ${e.message}`);
    break;
  }
  if (r.error) {
    console.log(`${pad(round)}회차 · 오류: ${r.error} ${r.detail ?? ""}`);
    break;
  }
  done += r.labeled ?? 0;
  const counts = {};
  for (const x of r.results ?? []) counts[x.label] = (counts[x.label] ?? 0) + 1;
  console.log(
    `${pad(round)}회차 · ${pad(r.labeled)}건 판정(${mmss(Date.now() - t)}) · ` +
      `적중 ${counts.hit ?? 0} 오탐 ${counts.dud ?? 0} 관찰중 ${counts.pending ?? 0} · ` +
      `누적 ${done} · 남은 ${r.remaining}`,
  );
  if (!r.remaining || !r.labeled) break;
}

console.log(`\n총 ${done}건 판정 · ${mmss(Date.now() - started)} 소요`);

const sum = await (await fetch(`${BASE}/api/discovery-label`, { cache: "no-store" })).json();
console.log("\n=== 최종 집계 ===");
console.log(JSON.stringify(sum.summary, null, 1));
