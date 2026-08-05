import fs from "node:fs";
import path from "node:path";

/**
 * 로컬 Instagram 수집기(`/instagram`)가 저장한 캡션을 읽는다. (서버 전용)
 * 공식 Graph API는 해시태그 공개 콘텐츠에 앱 검수를 요구하므로,
 * 로그인 세션 기반 로컬 수집 결과를 co-mention 검증 코퍼스로 사용한다.
 */
const DATA_PATH = path.join(
  process.cwd(),
  ".local",
  "instagram-analyzer",
  "data",
  "collections.json",
);

interface IgRun {
  id: string;
  terms?: string[];
}
interface IgItem {
  runId?: string;
  sourceTerm?: string;
  url?: string | null;
  caption?: string | null;
  previewText?: string | null;
  rawTextSnapshot?: string | null;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 해당 키워드로 수집된 게시물의 캡션 텍스트 목록. 없으면 빈 배열. */
export function loadInstagramCaptions(keyword: string): string[] {
  try {
    if (!fs.existsSync(DATA_PATH)) return [];
    const json = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as {
      runs?: IgRun[];
      items?: IgItem[];
    };
    const key = norm(keyword);
    const runIds = new Set(
      (json.runs ?? [])
        .filter((r) => (r.terms ?? []).some((t) => norm(t) === key))
        .map((r) => r.id),
    );

    // 같은 게시물이 여러 수집 세션에 중복될 수 있으므로 URL로 중복 제거
    const seen = new Set<string>();
    const docs: string[] = [];
    for (const it of json.items ?? []) {
      const belongs =
        (it.sourceTerm && norm(it.sourceTerm) === key) ||
        (it.runId && runIds.has(it.runId));
      if (!belongs) continue;
      const dedupeKey = it.url ?? "";
      if (dedupeKey) {
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
      }
      const text = [it.caption, it.previewText, it.rawTextSnapshot]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (text) docs.push(text);
    }
    return docs;
  } catch {
    return [];
  }
}
