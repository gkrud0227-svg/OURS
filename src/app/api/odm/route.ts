import { NextResponse } from "next/server";
import { readOdmCacheEntry } from "@/lib/odm-cache-store";

/**
 * 식품안전나라 "식품(첨가물)품목제조보고" 오픈API 프록시 (서비스 I1250).
 *
 * 국내 식품 제조사는 품목마다 제조보고를 의무 제출한다. 그 이력을 보면
 * **그 ODM사가 어떤 카테고리를 만들어본 적이 있는지**를 전화 전에 알 수 있다.
 *
 * 요청 형식 (필터는 경로 세그먼트로 붙인다):
 *   http://openapi.foodsafetykorea.go.kr/api/{key}/I1250/json/{start}/{end}/BSSH_NM=업체명
 *
 * 응답 봉투:
 *   { "I1250": { total_count: "123", row: [...], RESULT: { CODE, MSG } } }
 *   데이터 없음은 RESULT.CODE = INFO-200 (오류가 아님)
 */

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I1250";
/** 식품안전나라는 1회 최대 1000건. 화면 페이지 크기는 넉넉히 50. */
const PAGE_SIZE = 50;

interface Row {
  BSSH_NM?: string;
  PRDLST_NM?: string;
  PRDLST_DCNM?: string;
  PRMS_DT?: string;
  PRODUCTION?: string;
  POG_DAYCNT?: string;
  INDUTY_CD_NM?: string;
  DISPOS?: string;
  FRMLC_MTRQLT?: string;
  LAST_UPDT_DTM?: string;
  PRDLST_REPORT_NO?: string;
}

export interface OdmItem {
  company: string;
  product: string;
  foodType: string;
  reportDate: string;
  /** 생산종료여부 원본값 — "생산중단"류면 현재 생산 안 할 가능성 */
  production: string;
  shelfLife: string;
  industry: string;
  form: string;
  reportNo: string;
}

function mapRow(r: Row): OdmItem {
  return {
    company: (r.BSSH_NM ?? "").trim(),
    product: (r.PRDLST_NM ?? "").trim(),
    foodType: (r.PRDLST_DCNM ?? "").trim(),
    reportDate: (r.PRMS_DT ?? "").trim(),
    production: (r.PRODUCTION ?? "").trim(),
    shelfLife: (r.POG_DAYCNT ?? "").trim(),
    industry: (r.INDUTY_CD_NM ?? "").trim(),
    form: (r.DISPOS ?? "").trim(),
    reportNo: (r.PRDLST_REPORT_NO ?? "").trim(),
  };
}

/**
 * 매일 크론(/api/odm-cron)이 받아둔 거래처 카탈로그 캐시에서 찾는다(Supabase 우선, 파일 폴백).
 * 제한 시간대(09:00~19:00)에 실시간 조회가 막혔을 때의 폴백.
 */
const lookupCache = readOdmCacheEntry;

export async function POST(request: Request) {
  const key = process.env.FOODSAFETY_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "식품안전나라 API 키가 설정되지 않았습니다. .env.local에 FOODSAFETY_API_KEY를 추가한 뒤 서버를 다시 시작하세요.",
        needsKey: true,
      },
      { status: 400 },
    );
  }

  let body: {
    company?: string;
    foodType?: string;
    product?: string;
    page?: number;
    /** 한 번에 많이 받아 클라이언트에서 거를 때 쓴다(업체별 카탈로그 조회). 최대 1000. */
    maxRows?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const company = (body.company ?? "").trim();
  const foodType = (body.foodType ?? "").trim();
  const product = (body.product ?? "").trim();
  if (!company && !foodType && !product) {
    return NextResponse.json(
      { error: "업체명·식품유형·제품명 중 하나는 입력해야 합니다." },
      { status: 400 },
    );
  }

  const maxRows = body.maxRows ? Math.min(Math.max(1, body.maxRows), 5000) : 0;
  const page = Math.max(1, Math.min(body.page ?? 1, 100));
  const start = maxRows ? 1 : (page - 1) * PAGE_SIZE + 1;
  const end = maxRows ? maxRows : page * PAGE_SIZE;

  // 거래처 카탈로그 조회(maxRows + 업체명 단독)는 **매일 갱신되는 완전한 캐시에서 우선** 서빙한다.
  // 식약처는 요청당 1000건 제한 + 제한 시간대(09~19시)가 있어, 크론이 받아둔 전체 캐시가 더
  // 정확·안정적이다. (제품명·식품유형 검색이 이 카탈로그를 클라이언트에서 필터링한다)
  if (maxRows && company && !foodType && !product) {
    const cached = await lookupCache(company);
    if (cached) {
      const all = ((cached.entry.rows ?? []) as Row[]).map(mapRow).filter((r) => r.company || r.product);
      return NextResponse.json({
        total: cached.entry.total ?? all.length,
        page,
        pageSize: PAGE_SIZE,
        hasMore: end < all.length,
        items: all.slice(start - 1, end),
        cached: true,
        cachedAt: cached.entry.fetchedAt ?? null,
        cachedQuery: cached.matchedKey,
      });
    }
    // 캐시에 없으면 아래 실시간 조회로 폴백(첫 1000건).
  }

  // 필터는 경로 세그먼트(KEY=VALUE)로 붙는다.
  // 식약처 텍스트 파라미터는 부분매칭(LIKE)이라 PRDLST_NM=황치즈 → "미쯔 황치즈"도 잡힌다.
  const filters: string[] = [];
  if (company) filters.push(`BSSH_NM=${encodeURIComponent(company)}`);
  if (foodType) filters.push(`PRDLST_DCNM=${encodeURIComponent(foodType)}`);
  if (product) filters.push(`PRDLST_NM=${encodeURIComponent(product)}`);
  const url = `${BASE}/${key}/${SERVICE}/json/${start}/${end}${
    filters.length ? "/" + filters.join("/") : ""
  }`;

  let json: Record<string, unknown>;
  try {
    // 식약처 서버가 응답 없이 매달리는 경우가 있어(무응답 타임아웃) 20초 상한을 둔다.
    // 없으면 요청이 5분씩 걸려 화면이 멈춘다.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, { cache: "no-store", signal: ac.signal });
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // 식약처가 제한/과부하 시 비정상(HTML·빈) 응답을 주면 파싱 실패 → 캐시로 폴백.
      // (동시 조회에서 이 경로가 자주 터진다. 업체 검색만 폴백; 역검색은 캐시 없음)
      if (!foodType) {
        const cached = await lookupCache(company);
        if (cached) {
          const all = ((cached.entry.rows ?? []) as Row[]).map(mapRow).filter((r) => r.company || r.product);
          return NextResponse.json({
            total: cached.entry.total ?? all.length,
            page,
            pageSize: PAGE_SIZE,
            hasMore: end < all.length,
            items: all.slice(start - 1, end),
            cached: true,
            cachedAt: cached.entry.fetchedAt ?? null,
            cachedQuery: cached.matchedKey,
            notice: "식약처 응답이 비정상이라 미리 받아둔 자료를 보여줍니다.",
          });
        }
      }
      return NextResponse.json(
        { error: "식품안전나라 응답을 해석할 수 없습니다.", detail: text.slice(0, 200) },
        { status: 502 },
      );
    }
  } catch (e) {
    // 무응답·타임아웃도 밤에 받아둔 캐시로 폴백한다 (업체 검색만; 역검색은 캐시 없음).
    const aborted = e instanceof Error && e.name === "AbortError";
    if (!foodType) {
      const cached = await lookupCache(company);
      if (cached) {
        const all = ((cached.entry.rows ?? []) as Row[]).map(mapRow).filter((r) => r.company || r.product);
        return NextResponse.json({
          total: cached.entry.total ?? all.length,
          page,
          pageSize: PAGE_SIZE,
          hasMore: end < all.length,
          items: all.slice(start - 1, end),
          cached: true,
          cachedAt: cached.entry.fetchedAt ?? null,
          cachedQuery: cached.matchedKey,
          notice: "식약처 서버가 응답하지 않아 미리 받아둔 자료를 보여줍니다.",
        });
      }
    }
    return NextResponse.json(
      {
        error: aborted
          ? "식품안전나라 서버가 응답하지 않습니다(20초 초과). 잠시 후 다시 시도해 주세요."
          : "식품안전나라 서버에 연결하지 못했습니다.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // 봉투: { I1250: { total_count, row, RESULT } }  또는 최상위 RESULT(키 오류 등)
  const envelope = (json[SERVICE] ?? json) as {
    total_count?: string;
    row?: Row[];
    RESULT?: { CODE?: string; MSG?: string };
  };
  const code = envelope.RESULT?.CODE ?? "";
  const msg = envelope.RESULT?.MSG ?? "";

  // INFO-200 = 해당 데이터 없음 (오류 아님)
  if (code && !code.startsWith("INFO-000") && !code.startsWith("INFO-200")) {
    const invalidKey = /INFO-300|유효하지\s*않은/.test(`${code} ${msg}`);
    // ERROR-500은 식약처의 "Open API 제한적 운영"(2026.7.7.~, 매일 09:00~19:00) 때문이다.
    // 공지: 공공데이터 서버 불안정으로 인한 일시 제한. 종료일은 별도 공지 예정.
    // 제한 시간대 밖(19시 이후~익일 09시)에는 정상 조회된다. 키/코드 문제가 아니다.
    const upstreamDown = code.startsWith("ERROR-500");
    const hour = new Date().getHours();
    const inRestrictedWindow = hour >= 9 && hour < 19;

    // 실시간이 막혔으면 밤에 받아둔 캐시로 대신 답한다.
    if (upstreamDown && !foodType) {
      const cached = await lookupCache(company);
      if (cached) {
        const all = ((cached.entry.rows ?? []) as Row[]).map(mapRow).filter((r) => r.company || r.product);
        const slice = all.slice(start - 1, end);
        return NextResponse.json({
          total: cached.entry.total ?? all.length,
          page,
          pageSize: PAGE_SIZE,
          hasMore: end < all.length,
          items: slice,
          cached: true,
          cachedAt: cached.entry.fetchedAt ?? null,
          cachedQuery: cached.matchedKey,
          notice: `실시간 조회가 제한된 시간대(09:00~19:00)라 미리 받아둔 자료를 보여줍니다.`,
        });
      }
    }

    return NextResponse.json(
      {
        error: invalidKey
          ? "식품안전나라 API 키가 유효하지 않습니다. 발급받은 키를 확인하세요."
          : upstreamDown
            ? inRestrictedWindow
              ? "식약처가 Open API를 제한 운영 중입니다 (매일 09:00~19:00). 키 문제가 아니며, 19시 이후에 조회하시면 됩니다."
              : "식품안전나라 서버가 이 서비스(I1250)에 오류를 반환하고 있습니다. 키 문제가 아닙니다 — 잠시 후 다시 시도해 주세요."
            : `식품안전나라 API 오류: ${msg || code}`,
        detail: upstreamDown
          ? `${code} ${msg} · 식약처 공지 "Open API 제한적 운영('26.7.7.~)" — 서버 불안정으로 매일 09:00~19:00 이용 제한, 종료일 별도 공지.`
          : `${code} ${msg}`.trim(),
        needsKey: invalidKey,
        upstreamDown,
        restrictedWindow: upstreamDown && inRestrictedWindow,
      },
      { status: invalidKey ? 400 : 502 },
    );
  }

  const rows = (envelope.row ?? []).map(mapRow).filter((r) => r.company || r.product);
  const total = Number(envelope.total_count ?? rows.length) || 0;

  return NextResponse.json({
    total,
    page,
    pageSize: maxRows || PAGE_SIZE,
    hasMore: end < total,
    items: rows,
    notice: msg || undefined,
  });
}
