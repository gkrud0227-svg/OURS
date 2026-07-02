import type { Category, Keyword } from "./types";

interface Seed {
  name: string;
  category: Category;
  /** 4주치 샘플 상대 검색지수 (API 키 연동 전 데모용) */
  sample: [number, number, number, number];
}

/**
 * 모니터링 기본 키워드 목록. API 키를 연동해 "실데이터 갱신"을 누르기 전까지는
 * 아래 sample 값(상대 검색지수)으로 대시보드를 미리 확인할 수 있다.
 */
const SEEDS: Seed[] = [
  { name: "흑임자", category: "디저트", sample: [40, 48, 55, 78] },
  { name: "두바이초콜릿", category: "디저트", sample: [70, 74, 80, 88] },
  { name: "소금버터롤", category: "베이커리", sample: [30, 33, 35, 34] },
  { name: "크루아상", category: "베이커리", sample: [60, 58, 55, 50] },
  { name: "말차", category: "음료", sample: [50, 55, 62, 85] },
  { name: "크렘브륄레", category: "디저트", sample: [25, 27, 30, 33] },
  { name: "티라미수", category: "디저트", sample: [55, 57, 60, 63] },
  { name: "소금빵", category: "베이커리", sample: [65, 66, 64, 63] },
  { name: "마카롱", category: "디저트", sample: [48, 46, 45, 44] },
  { name: "카눌레", category: "베이커리", sample: [35, 40, 48, 66] },
  { name: "피스타치오", category: "디저트", sample: [58, 62, 70, 92] },
  { name: "딸기디저트", category: "디저트", sample: [72, 70, 68, 60] },
  { name: "까눌레", category: "베이커리", sample: [33, 38, 45, 60] },
  { name: "왁뿌", category: "디저트", sample: [20, 26, 35, 52] },
];

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 주어진 날짜가 속한 주의 월요일. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 이번 주 월요일 기준 최근 n주의 월요일 날짜(오래된→최근). */
export function recentMondays(n = 4): string[] {
  const current = mondayOf(new Date());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(current.getDate() - i * 7);
    out.push(fmtDate(d));
  }
  return out;
}

export function seedKeywords(): Keyword[] {
  const weeks = recentMondays(4);
  const now = new Date().toISOString();
  return SEEDS.map((s) => ({
    id: crypto.randomUUID(),
    name: s.name,
    category: s.category,
    weeks: weeks.map((period, i) => ({ period, ratio: s.sample[i] })),
    tiktok: null,
    source: "sample" as const,
    updatedAt: now,
  }));
}
