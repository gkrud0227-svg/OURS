/**
 * "카테고리가 됐는가 vs 단발 히트인가" 가설 검증 — **SNS(유튜브) 신호만** 사용.
 *
 * ⚠️ 순환 검증 방지가 이 스크립트의 존재 이유다.
 *    "카테고리가 됐다"를 검색 잔존율로 판정하면 잔존율로 잔존율을 예측하는 셈이라 반드시
 *    확증이 나온다. 그래서 분류는 **결과를 전혀 쓰지 않는 선행 지표**로만 한다.
 *
 * ⚠️ 품목제조보고(식품안전나라)는 쓰지 않는다 — 제조사가 만들기 시작하는 시점은 이미
 *    트렌드가 고점을 찍은 뒤라 **후행 지표**다. 선행 분류에 쓸 수 없다.
 *
 * 선행 신호 (전부 **피크 이전** 코퍼스에서만 계산한다):
 *
 *   1) 재현 시도 비율(recipeShare) — 이 말이 나온 영상 중 "만들기·레시피·홈베이킹" 류가
 *      차지하는 비율. **남들이 따라 만들기 시작하면 카테고리가 된다**는 것이 가설의 기전이다.
 *      사서 먹어보기만("구했다·후기") 하면 그 제품이 식을 때 같이 식는다.
 *
 *   2) 수식어 다양성(modifierDiv) — 용어 바로 앞에 붙는 **고유 수식어 수**(영상 수로 정규화).
 *      카테고리는 변주가 생긴다(마늘소금빵·크림소금빵·자연도 소금빵). 단일 SKU는 안 생긴다.
 *
 * 두 값 모두 피크 이전 영상 제목에서 나오므로 이후 잔존율과 독립이다.
 *
 *   node scripts/category-backtest.mjs
 *   (dev 서버 필요 — 데이터랩 프록시. 유튜브는 스크립트가 직접 호출한다.)
 *   ⚠️ 유튜브 쿼터를 쓴다. 용어당 약 200 units → 12개면 약 2,400 units.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const START = "2016-01-01";
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** 지속성 백테스트와 같은 대상 (피크가 1년 이상 지나 잔존율 측정이 가능한 것들). */
const TERMS = [
  "말차", "흑임자", "얼그레이", "인절미", "트러플", "바질",
  "탕후루", "크로플", "약과", "소금빵", "먹태깡", "포켓몬빵",
];

/* ── 측정 규칙 ─────────────────────────────────────────────── */
const RISE_LEVEL = 0.25;
const PRE_BASE_WEEKS = 26;
const CENSOR_WEEKS = 26;
const RETENTION_AT = 52;
const SMOOTH = 3;
/** 선행 신호를 재는 구간 — 피크 **이전** 이만큼. 피크 이후는 결과 오염이라 절대 포함하지 않는다. */
const PRE_PEAK_WEEKS = 12;
/** 용어당 검색 페이지 수 (1페이지 = 50건 = 100 units). */
const PAGES = 2;
/** 이 영상 수 미만이면 신호가 불안정해 판정에서 뺀다. */
const MIN_VIDEOS = 10;

/** 재현 시도 신호어 — 직접 만들어 보는 콘텐츠. */
const RECIPE_WORDS = [
  "레시피", "만들기", "만드는법", "만들어", "홈베이킹", "베이킹", "집에서",
  "홈카페", "따라하기", "황금비율", "반죽", "만듬", "만듦", "만들었",
];

/* ── 판정 기준 (결과 보기 전 고정) ─────────────────────────── */
/** C1(주): 재현 시도 비율 ↔ 기준선 보정 52주 잔존율의 스피어만 순위상관. */
const C1_MIN_RHO = 0.5;
/** C2(보조·탐색적): 수식어 다양성 ↔ 잔존율. 다중비교를 피하려 주 기준은 C1 하나로 둔다. */
const C2_MIN_RHO = 0.5;

/* ── 유틸 ──────────────────────────────────────────────────── */
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

/** 순위 (동점은 평균순위). */
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/** 스피어만 순위상관. 표본이 3 미만이거나 한쪽이 상수면 null. */
export function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rx = ranks(xs), ry = ranks(ys);
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** 제목 묶음에서 선행 신호 두 가지를 뽑는다 (순수 함수 · 검증 대상). */
export function snsSignals(term, titles) {
  if (!titles.length) return { videos: 0, recipeShare: null, modifierDiv: null };
  const t = norm(term);
  let recipe = 0;
  const modifiers = new Set();
  for (const raw of titles) {
    const lower = (raw ?? "").toLowerCase();
    if (RECIPE_WORDS.some((w) => lower.includes(w))) recipe += 1;
    // 용어 바로 앞 수식어 — 공백을 지운 형태로 보면 "마늘소금빵"과 "자연도 소금빵"을 같이 잡는다.
    const flat = norm(raw);
    const at = flat.indexOf(t);
    if (at > 0) {
      const before = flat.slice(Math.max(0, at - 4), at);
      if (before.length >= 2) modifiers.add(before);
    }
  }
  return {
    videos: titles.length,
    recipeShare: recipe / titles.length,
    // 영상 수로 나눠 표본 크기 편향을 줄인다 (많이 모을수록 수식어도 많아지므로).
    modifierDiv: modifiers.size / titles.length,
  };
}

/* ── 데이터 수집 ───────────────────────────────────────────── */
/** 로컬 환경파일에서 유튜브 키를 읽는다 (check-foodsafety.mjs 와 같은 방식). */
function readKey() {
  const text = readFileSync(join(ROOT, ".env" + ".local"), "utf8");
  const line = text.split(/\r?\n/).find((l) => /^\s*YOUTUBE_API_KEY\s*=/.test(l));
  if (!line) throw new Error("YOUTUBE_API_KEY 를 찾을 수 없습니다.");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function series(keyword) {
  const res = await fetch(`${BASE}/api/datalab`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      keywords: [keyword],
      startDate: START,
      endDate: new Date().toISOString().slice(0, 10),
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return (j.results?.[0]?.data ?? []).map((d) => ({ period: d.period, ratio: d.ratio }));
}

/**
 * 피크 이전 구간의 영상 제목을 모은다.
 * publishedBefore=피크일 이므로 피크 이후 데이터는 절대 들어오지 않는다 — 이게 선행성의 근거다.
 */
async function prePeakTitles(key, term, peakIso) {
  const before = new Date(peakIso);
  const after = new Date(before.getTime() - PRE_PEAK_WEEKS * MS_PER_WEEK);
  const titles = [];
  const channels = new Set();
  let token;
  let units = 0;
  for (let p = 0; p < PAGES; p += 1) {
    const sp = new URLSearchParams({
      key,
      part: "snippet",
      type: "video",
      order: "date",
      maxResults: "50",
      regionCode: "KR",
      relevanceLanguage: "ko",
      publishedAfter: after.toISOString(),
      publishedBefore: before.toISOString(),
      q: term,
    });
    if (token) sp.set("pageToken", token);
    const res = await fetch(`${SEARCH_URL}?${sp}`);
    units += 100;
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    const ids = (j.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
    if (!ids.length) break;
    const vp = new URLSearchParams({ key, part: "snippet", id: ids.join(","), maxResults: "50" });
    const vj = await (await fetch(`${VIDEOS_URL}?${vp}`)).json();
    units += 1;
    for (const v of vj.items ?? []) {
      titles.push(v.snippet?.title ?? "");
      if (v.snippet?.channelId) channels.add(v.snippet.channelId);
    }
    token = j.nextPageToken;
    if (!token) break;
  }
  return { titles, channels: channels.size, units };
}

/** 검색 시계열에서 피크와 기준선 보정 잔존율을 낸다 (지속성 백테스트와 동일 규칙). */
function persistence(data) {
  const r = data.map((d) => d.ratio);
  if (r.length < 60) return { error: "표본 부족" };
  const peak = Math.max(...r);
  if (peak <= 0) return { error: "검색량 없음" };
  const peakIdx = r.indexOf(peak);
  if (peakIdx < CENSOR_WEEKS) return { error: "좌측 절단" };

  const riseIdx = r.findIndex((v) => v >= peak * RISE_LEVEL);
  const preWindow = r.slice(Math.max(0, riseIdx - PRE_BASE_WEEKS), Math.max(0, riseIdx));
  const preBase = preWindow.length >= 8 ? median(preWindow) / peak : null;

  const lo = peakIdx + RETENTION_AT - SMOOTH;
  const hi = peakIdx + RETENTION_AT + SMOOTH;
  const ret = hi < r.length ? mean(r.slice(lo, hi + 1)) / peak : null;
  const adj =
    ret == null || preBase == null || preBase >= 1 ? null : Math.max(0, (ret - preBase) / (1 - preBase));

  return { peakIso: data[peakIdx].period, preBase, ret, adjRet: adj };
}

/* ── 실행 ──────────────────────────────────────────────────── */
async function main() {
  const key = readKey();
  const rows = [];
  let units = 0;
  for (const term of TERMS) {
    try {
      const p = persistence(await series(term));
      if (p.error) {
        rows.push({ term, error: p.error });
        continue;
      }
      const yt = await prePeakTitles(key, term, p.peakIso);
      units += yt.units;
      rows.push({ term, ...p, ...snsSignals(term, yt.titles), channels: yt.channels });
    } catch (e) {
      rows.push({ term, error: e.message });
    }
  }

  console.log(`대상 ${TERMS.length}개 · 검색 ${START}~현재`);
  console.log(`SNS 신호는 **피크 이전 ${PRE_PEAK_WEEKS}주** 유튜브 코퍼스에서만 계산 (쿼터 ${units} units)\n`);
  console.log(
    "키워드".padEnd(14), "피크".padEnd(12), "영상".padStart(5), "채널".padStart(5),
    "재현시도".padStart(9), "수식어".padStart(7), "보정52".padStart(8),
  );
  for (const x of rows) {
    if (x.error) {
      console.log(x.term.padEnd(14), `(${x.error})`);
      continue;
    }
    console.log(
      x.term.padEnd(14),
      String(x.peakIso).padEnd(12),
      String(x.videos).padStart(5),
      String(x.channels).padStart(5),
      pct(x.recipeShare).padStart(9),
      (x.modifierDiv == null ? "—" : x.modifierDiv.toFixed(2)).padStart(7),
      pct(x.adjRet).padStart(8),
    );
  }

  const usable = rows.filter(
    (x) => !x.error && x.adjRet != null && x.recipeShare != null && x.videos >= MIN_VIDEOS,
  );
  console.log(
    `\n── 사전 등록 판정 ── (분석 가능 ${usable.length}/${TERMS.length}건 · 영상 ${MIN_VIDEOS}건 미만 제외)`,
  );
  if (usable.length < 3) {
    console.log("표본이 3건 미만이라 판정할 수 없다.");
    return;
  }

  const rho1 = spearman(usable.map((x) => x.recipeShare), usable.map((x) => x.adjRet));
  const c1 = rho1 != null && rho1 >= C1_MIN_RHO;
  console.log(
    `C1 재현 시도 비율 ↔ 보정 52주 잔존율 · ρ = ${rho1?.toFixed(2)} (기준 ${C1_MIN_RHO} 이상) → ${c1 ? "충족" : "미충족"}`,
  );

  const rho2 = spearman(usable.map((x) => x.modifierDiv), usable.map((x) => x.adjRet));
  const c2 = rho2 != null && rho2 >= C2_MIN_RHO;
  console.log(`C2 수식어 다양성 ↔ 보정 52주 잔존율 · ρ = ${rho2?.toFixed(2)} (탐색적) → ${c2 ? "충족" : "미충족"}`);

  console.log(`\n판정: ${c1 ? (c2 ? "확증" : "확증(주 기준)") : c2 ? "부분 확증(보조만)" : "반증"}`);
  console.log(`표본 n=${usable.length} — 통계적 검정을 하기엔 작다. 패턴 관찰로만 읽을 것.`);
  console.log("⚠️ 오래된 피크(2017~2018)는 당시 한국어 유튜브 자체가 적어 표본이 얇다. 영상 수를 함께 볼 것.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
