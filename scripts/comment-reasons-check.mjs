/**
 * 이유 태그 코퍼스 품질 점검 — 제목 vs 시청자 댓글.
 *
 * 목적: SNS 확산 흐름의 "이유 태그(맛·식감·계절·비주얼·희소성)"를 영상 제목이 아니라
 *       **시청자 댓글**에서 뽑으면 실제로 신호가 잡히는지를 데이터로 확인한다.
 *       (제목엔 '존맛·바삭' 같은 이유어가 거의 없어 지금은 대부분 0건으로 잡힌다.)
 *
 * 방법:
 *   1) KR 최근 영상을 발굴과 같은 방식(order=date, 의도어 시드)으로 검색해 영상 ID를 얻는다.
 *   2) 각 영상의 상위 댓글(commentThreads.list, 1 unit)을 최대 100개씩 모은다.
 *   3) 같은 이유 사전으로 (a) 제목 코퍼스 (b) 댓글 코퍼스를 각각 집계해 나란히 비교한다.
 *      집계 규칙은 src/lib/reasons.ts 의 analyzeReasons 와 동일:
 *      한 문서(제목/댓글)에서 여러 번 나와도 1건 = "언급한 문서 비율(docHits/docCount)".
 *
 * ⚠️ 이유 사전(REASON_DICT_KO)은 src/lib/reasons.ts 에서 복사한 것이다. 사전을 바꾸면
 *    양쪽을 같이 손봐야 한다. 이 스크립트는 UI를 바꾸지 않는 일회성 품질 프로브다.
 *
 * 사용법:
 *   node scripts/comment-reasons-check.mjs
 *   SEED="편의점 신상" MAX_VIDEOS=25 RECENT_DAYS=21 node scripts/comment-reasons-check.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SEED = process.env.SEED ?? "신상 디저트";
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS ?? 20);
const RECENT_DAYS = Number(process.env.RECENT_DAYS ?? 21);
const COMMENTS_PER_VIDEO = 100; // commentThreads.list maxResults 상한
const REGION = "KR";
/** date=발굴과 동일(갓 올라온 영상), viewCount=댓글 많은 인기영상(품질 상한 확인용). */
const ORDER = process.env.ORDER === "viewCount" ? "viewCount" : "date";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads";

/** 이유 사전 (src/lib/reasons.ts REASON_DICT 한국어판과 동일 — 부분일치). */
const REASON_DICT_KO = [
  { key: "taste", label: "맛 궁합", words: ["고소","달콤","달달","짭짤","짭조름","단짠","새콤","꿀조합","어울리","밸런스"] },
  { key: "texture", label: "식감", words: ["바삭","겉바속촉","쫀득","쫄깃","촉촉","부드럽","크리미","꾸덕","말랑","폭신","찐득"] },
  { key: "season", label: "계절 연상", words: ["여름","한여름","여름철","겨울","겨울철","봄철","가을철","가을","시원","따끈","따뜻한","더위","무더위","폭염","제철","삼복","복날"] },
  { key: "visual", label: "비주얼·인증샷", words: ["예쁘","비주얼","색감","인증샷","인생샷","감성","플레이팅","존예","때깔","힙한"] },
  { key: "scarcity", label: "희소성", words: ["품절","한정","대란","오픈런","웨이팅","줄서","못구","없어서못","완판","리셀"] },
];

/** .env.local 에서 YOUTUBE_API_KEY 를 읽는다. (실제 값은 출력하지 않는다) */
function readKey() {
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((l) => /^\s*YOUTUBE_API_KEY\s*=/.test(l));
    if (!line) return null;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return (s ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/** analyzeReasons 와 동일한 집계 — docHits = 그 이유어를 언급한 문서 수. */
function analyze(texts) {
  const docs = texts.map((t) => (t ?? "").toLowerCase());
  const docCount = docs.length;
  const cats = REASON_DICT_KO.map((cat) => {
    let matches = 0, docHits = 0;
    const wordCounts = {};
    const samples = [];
    for (let d = 0; d < docs.length; d += 1) {
      let inDoc = false;
      for (const w of cat.words) {
        const c = countOccurrences(docs[d], w);
        if (c > 0) { matches += c; wordCounts[w] = (wordCounts[w] ?? 0) + c; inDoc = true; }
      }
      if (inDoc) { docHits += 1; if (samples.length < 2) samples.push(texts[d]); }
    }
    const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
    return { key: cat.key, label: cat.label, matches, docHits, topWords, samples, share: docCount ? docHits / docCount : 0 };
  });
  cats.sort((a, b) => b.docHits - a.docHits || b.matches - a.matches);
  return { docCount, cats };
}

function printReport(title, res) {
  console.log(`\n■ ${title} — 문서 ${res.docCount}건`);
  const active = res.cats.filter((c) => c.docHits > 0);
  if (!active.length) { console.log("  (이유어 매칭 0건 — 신호 없음)"); return; }
  for (const c of res.cats) {
    const pct = Math.round(c.share * 100);
    const bar = "█".repeat(Math.round(c.share * 20)).padEnd(20, "·");
    console.log(`  ${c.label.padEnd(7)} ${bar} ${String(c.docHits).padStart(4)}건 · ${String(pct).padStart(3)}%  ${c.topWords.join(", ")}`);
  }
  const top = res.cats.find((c) => c.docHits > 0);
  if (top) {
    console.log(`  · 최상위 "${top.label}" 예시 댓글:`);
    for (const s of top.samples) console.log(`      – ${stripHtml(s).slice(0, 80)}`);
  }
}

async function main() {
  const key = readKey();
  if (!key) { console.error("YOUTUBE_API_KEY 를 .env.local 에서 찾지 못했습니다."); process.exit(2); }

  let units = 0;
  const publishedAfter = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();

  // 1) 최근 영상 검색 (발굴과 동일: order=date + 의도어 시드)
  const sp = new URLSearchParams({
    key, part: "snippet", type: "video", order: ORDER, maxResults: "50",
    regionCode: REGION, relevanceLanguage: "ko", publishedAfter, q: SEED,
  });
  const search = await getJson(`${SEARCH_URL}?${sp}`);
  units += 100;
  if (!search.ok) { console.error(`검색 실패 ${search.status}: ${(search.text ?? "").slice(0, 200)}`); process.exit(1); }

  const items = (search.json.items ?? []).slice(0, MAX_VIDEOS);
  const videos = items.map((i) => ({ id: i.id?.videoId, title: i.snippet?.title ?? "" })).filter((v) => v.id);
  console.log(`시드 "${SEED}" · 최근 ${RECENT_DAYS}일 · 영상 ${videos.length}개 (검색 100 units)`);

  // 2) 각 영상 댓글 수집 (1 unit/영상)
  const titles = [];
  const comments = [];
  let disabled = 0, withComments = 0;
  for (const v of videos) {
    titles.push(v.title);
    const cp = new URLSearchParams({
      key, part: "snippet", videoId: v.id, order: "relevance",
      maxResults: String(COMMENTS_PER_VIDEO), textFormat: "plainText",
    });
    const r = await getJson(`${COMMENTS_URL}?${cp}`);
    units += 1;
    if (!r.ok) {
      // 댓글 꺼짐(403 commentsDisabled)은 정상 — 건너뛴다.
      if (r.status === 403) disabled += 1;
      else console.error(`  댓글 실패(${v.id}) ${r.status}: ${(r.text ?? "").slice(0, 120)}`);
      continue;
    }
    const got = (r.json.items ?? []).map((it) => it.snippet?.topLevelComment?.snippet?.textOriginal ?? "");
    if (got.length) withComments += 1;
    for (const c of got) comments.push(c);
  }

  console.log(`댓글 수집: 영상 ${withComments}개에서 ${comments.length}개 · 댓글꺼짐 ${disabled}개 · 총 사용 ~${units} units`);

  // 3) 같은 사전으로 제목 vs 댓글 집계 비교
  printReport("제목 코퍼스", analyze(titles));
  printReport("댓글 코퍼스", analyze(comments));

  console.log("\n판단 기준: 댓글 쪽 카테고리들의 docHits/％가 제목보다 뚜렷하고, 예시 댓글이 실제로 그 이유를 말하면 품질 OK → 1번(댓글 기반 이유 태그 부활) 진행.");
}

main().catch((e) => { console.error(e); process.exit(1); });
