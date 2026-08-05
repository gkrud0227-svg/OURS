"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchOdm,
  fetchOdmPartners,
  OdmKeyError,
  FOOD_TYPE_PRESETS,
  KNOWN_PARTNERS,
  isKnownPartner,
  productionState,
  formatReportDate,
  formatFetchedAt,
  loadCandidates,
  saveCandidates,
  candidateKey,
  CONTACT_META,
  type OdmItem,
  type OdmResponse,
  type OdmCandidate,
  type ContactStatus,
} from "@/lib/odm";

type Mode = "company" | "foodType" | "product";

const TONE: Record<"good" | "mid" | "bad" | "muted" | "unknown", string> = {
  good: "bg-accent-soft text-accent",
  mid: "bg-[#fbf3de] text-[#8a6a00]",
  bad: "bg-down-soft text-down",
  muted: "bg-[#f0eee9] text-muted-strong",
  unknown: "bg-[#f0eee9] text-muted",
};

/** "업체명 제품명" 네이버 검색 URL. */
function naverSearchUrl(company: string, product: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(`${company} ${product}`.trim())}`;
}

/** 제품명을 네이버 검색으로 여는 링크(호버 시 ↗). */
function ProductLink({ company, product }: { company: string; product: string }) {
  return (
    <a
      href={naverSearchUrl(company, product)}
      target="_blank"
      rel="noopener noreferrer"
      title="네이버에서 이 제품 검색"
      className="group inline-flex items-center gap-1 transition-colors hover:text-accent"
    >
      {product}
      <span
        aria-hidden
        className="text-[11px] leading-none text-accent opacity-0 transition-opacity group-hover:opacity-100"
      >
        ↗
      </span>
    </a>
  );
}

export default function OdmPage() {
  const [mode, setMode] = useState<Mode>("company");
  /** 검색 화면 / 컨택 후보 화면 전환 */
  const [view, setView] = useState<"search" | "saved">("search");
  const [query, setQuery] = useState("");
  /** 제품명 탭 전용 — 선택적 업체명. 비우면 거래처 전체, 넣으면 그 업체 안에서만. */
  const [companyFilter, setCompanyFilter] = useState("");
  const [data, setData] = useState<OdmResponse | null>(null);
  const [searched, setSearched] = useState<{ mode: Mode; q: string; company?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const [candidates, setCandidates] = useState<OdmCandidate[]>([]);
  const [hydrated, setHydrated] = useState(false);
  /** 트렌드 발굴 화면에서 넘어왔을 때의 원래 키워드 */
  const [fromTerm, setFromTerm] = useState<string | null>(null);
  /** LLM 으로 품목유형을 추론하는 중 */
  const [inferring, setInferring] = useState(false);

  useEffect(() => {
    setCandidates(loadCandidates());
    setHydrated(true);
    // 트렌드 화면에서 "ODM 스크리닝" 으로 넘어온 경우.
    // type = 품목유형(자동 조회), term = 원래 트렌드 키워드(맥락 표시용)
    const params = new URLSearchParams(window.location.search);
    const t = params.get("type");
    const from = params.get("term");
    if (from) setFromTerm(from);
    if (t) {
      setMode("foodType");
      setQuery(t);
      void run("foodType", t);
    } else if (from) {
      // 사전이 유형을 못 정한 키워드 — LLM 폴백으로 한 번 더 시도한다.
      // 키가 없거나 실패하면 { type: null } 이 와서 사용자가 직접 고르는 흐름이 된다.
      setMode("foodType");
      setInferring(true);
      fetch("/api/food-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: from }),
      })
        .then((r) => r.json())
        .then((j: { type?: string | null }) => {
          if (j.type) {
            setQuery(j.type);
            void run("foodType", j.type);
          }
        })
        .catch(() => {})
        .finally(() => setInferring(false));
    }
  }, []);

  useEffect(() => {
    if (hydrated) saveCandidates(candidates);
  }, [candidates, hydrated]);

  async function run(m: Mode, q: string) {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setNeedsKey(false);
    // 제품명 탭: 업체명을 넣으면 그 업체 하나만(거래처 밖도 가능), 비우면 거래처 전체.
    const company = m === "product" ? companyFilter.trim() : "";
    try {
      // 업체명 검색 = 시중 전체 시장. 제품명·식품유형 검색 = 거래처(KNOWN_PARTNERS) 또는 지정 업체.
      const res =
        m === "company"
          ? await fetchOdm({ company: term })
          : m === "product"
            ? await fetchOdmPartners({ product: term }, company ? [company] : undefined)
            : await fetchOdmPartners({ foodType: term });
      setData(res);
      setSearched({ mode: m, q: term, company: company || undefined });
    } catch (e) {
      setData(null);
      if (e instanceof OdmKeyError) {
        setNeedsKey(true);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "조회에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(mode, query);
  }

  function addCandidate(company: string, product: string, note: string) {
    const key = candidateKey(company, product);
    setCandidates((prev) =>
      prev.some((c) => candidateKey(c.company, c.product) === key)
        ? prev
        : [
            { company, product, note, status: "none", savedAt: new Date().toISOString() },
            ...prev,
          ],
    );
  }
  function setStatus(key: string, status: ContactStatus) {
    setCandidates((prev) =>
      prev.map((c) => (candidateKey(c.company, c.product) === key ? { ...c, status } : c)),
    );
  }
  function removeCandidate(key: string) {
    setCandidates((prev) => prev.filter((c) => candidateKey(c.company, c.product) !== key));
  }

  /** 이미 저장된 (업체+제품) 키 집합 — 저장 버튼 상태용. */
  const savedKeys = useMemo(
    () => new Set(candidates.map((c) => candidateKey(c.company, c.product))),
    [candidates],
  );

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.035em]">ODM 스크리닝</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[11px] font-bold text-accent">
            식품안전나라
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-strong">
          국내 식품 제조사가 의무 제출하는 <b className="font-medium">품목제조보고</b> 이력을 조회합니다.
          전화하기 전에 <b className="font-medium">&ldquo;이 회사가 이 카테고리를 만들어본 적이 있는지&rdquo;</b>를
          먼저 걸러, 헛걸음을 줄입니다.
        </p>
      </header>

      {/* 상단 탭 — 검색 모드 3종 + 컨택 후보 보기 */}
      <div className="inline-flex flex-wrap rounded-[10px] border border-line bg-white p-1">
        {(
          [
            ["company", "업체명으로 검색"],
            ["product", "제품명으로 검색"],
            ["foodType", "식품유형으로 역검색"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setView("search");
              setMode(m);
            }}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-bold transition-colors ${
              view === "search" && mode === m
                ? "bg-accent text-white"
                : "text-muted hover:text-muted-strong"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setView("saved")}
          className={`rounded-lg px-4 py-1.5 text-[13px] font-bold transition-colors ${
            view === "saved" ? "bg-accent text-white" : "text-muted hover:text-muted-strong"
          }`}
        >
          컨택 후보{candidates.length > 0 ? ` ${candidates.length}` : ""}
        </button>
      </div>

      {view === "search" && (
        <>
      {/* 트렌드 발굴에서 넘어온 맥락 */}
      {fromTerm && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-accent-soft bg-accent-soft/40 px-4 py-3 text-sm text-accent-ink">
          <Link href="/domestic" className="font-semibold underline underline-offset-2">
            국내 발굴
          </Link>
          <span className="text-muted-strong">에서</span>
          <b className="font-bold">&ldquo;{fromTerm}&rdquo;</b>
          {query ? (
            <span className="text-muted-strong">
              → <b className="font-bold text-accent">{query}</b> 제조 이력이 있는 업체를 찾는 중
            </span>
          ) : inferring ? (
            <span className="text-muted-strong">→ 품목유형을 추론하는 중…</span>
          ) : (
            <span className="text-muted-strong">
              → 품목유형을 자동 판단하지 못했습니다. 아래에서 골라주세요.
            </span>
          )}
        </div>
      )}

      {/* 필수 안내 — 데이터 성격 */}
      <div className="rounded-xl bg-[#fbf3de] px-4 py-3 text-xs leading-relaxed text-[#8a6a00]">
        <b className="font-bold">이 데이터는 과거 신고 이력입니다.</b> 실시간 생산 여부나 재고를 보장하지
        않습니다. 신고 이력이 있어도 현재는 생산하지 않을 수 있으니,{" "}
        <b className="font-bold">현재 생산 여부·최소 발주 수량(MOQ)은 반드시 직접 확인</b>하세요.
        (참고용으로 <b className="font-bold">생산종료여부</b> 필드를 함께 표시합니다.)
      </div>

      {/* 검색 */}
      <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-white p-4">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          {mode === "company" ? (
            <>
              <b className="font-semibold text-muted-strong">업체명 검색</b>은 시중 전체 제조사를 조회합니다.
            </>
          ) : mode === "product" ? (
            <>
              <b className="font-semibold text-muted-strong">제품명 검색</b> — 업체명을 비우면 거래처{" "}
              {KNOWN_PARTNERS.length}곳 전체에서, 업체명을 넣으면{" "}
              <b className="font-semibold text-muted-strong">그 업체 안에서만</b> 제품명으로 조회합니다.
              (업체명은 거래처 밖 업체도 됩니다.)
            </>
          ) : (
            <>
              <b className="font-semibold text-muted-strong">식품유형 검색</b>은 기존 거래처{" "}
              {KNOWN_PARTNERS.length}곳({KNOWN_PARTNERS.join(", ")}) 안에서만 조회합니다.
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          {mode === "product" && (
            <input
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              placeholder="업체명 (선택 — 비우면 거래처 전체)"
              className="h-10 w-full rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright sm:w-56 sm:flex-none"
            />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "company"
                ? "ODM 업체명 (예: 삼립)"
                : mode === "product"
                  ? "제품명 키워드 (예: 황치즈)"
                  : "식품유형 (예: 빵류)"
            }
            className="h-10 flex-1 min-w-[240px] rounded-[10px] border border-line px-3.5 text-sm outline-none focus:border-accent-bright"
          />
          <button
            type="submit"
            disabled={loading}
            style={{ background: "linear-gradient(145deg,#5a9b12,#4e8b10)" }}
            className="h-10 rounded-[10px] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(78,139,16,0.32)] transition-[filter] hover:brightness-105 disabled:opacity-60"
          >
            {loading ? "조회 중…" : "조회"}
          </button>
        </div>

        {mode === "foodType" && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11.5px] text-muted">자주 쓰는 카테고리 — 누르면 바로 조회합니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(FOOD_TYPE_PRESETS.flatMap((p) => p.types))].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setQuery(t);
                    void run("foodType", t);
                  }}
                  className="rounded-full border border-line px-2.5 py-1 text-[11.5px] font-semibold text-muted-strong transition-colors hover:border-accent-bright hover:text-accent"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {needsKey && <KeyGuide />}
      {error && !needsKey && (
        <div className="rounded-xl bg-down-soft px-4 py-3 text-sm text-down">{error}</div>
      )}

      {/* 결과 */}
      {data && searched && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-strong">
              <b className="font-bold text-accent-ink">{searched.q}</b>{" "}
              {searched.mode === "company"
                ? "신고 품목"
                : searched.mode === "product"
                  ? `제품 (${searched.company ?? "거래처"})`
                  : "품목유형 제품 (거래처)"}
            </h2>
            <span className="text-xs text-muted">
              전체 {data.total.toLocaleString()}건 중 {data.items.length}건 표시
              {data.hasMore && " (더 있음)"}
            </span>
          </div>

          {data.cached && (
            <div className="mb-3 rounded-xl border border-[#e8dcae] bg-[#fdfaf0] px-3.5 py-2.5 text-xs leading-relaxed text-[#8a6a00]">
              <b className="font-bold">미리 받아둔 자료</b>
              {data.cachedAt && ` · ${formatFetchedAt(data.cachedAt)} 기준`}
              {data.cachedQuery && ` · 검색어 "${data.cachedQuery}"`}
              <br />
              식약처가 매일 09:00~19:00 실시간 조회를 제한해서, 그 시간대에는 저장해둔 자료를 보여줍니다.
              최신 상태는 19시 이후에 다시 검색하세요.
            </div>
          )}

          {data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {searched.mode === "company" ? (
                <>
                  신고 이력을 찾지 못했습니다. 업체명은 <b className="font-semibold">정식 상호</b> 일부(예:
                  &ldquo;삼립&rdquo;)로 넣어보세요.
                </>
              ) : searched.mode === "product" && searched.company ? (
                <>
                  <b className="font-semibold">{searched.company}</b>에서 &ldquo;{searched.q}&rdquo; 관련 품목을
                  찾지 못했습니다. 업체명이 정확한지(정식 상호 일부) 확인해보세요.
                </>
              ) : (
                <>
                  거래처 {KNOWN_PARTNERS.length}곳 안에서 &ldquo;{searched.q}&rdquo; 관련 품목을 찾지
                  못했습니다. {searched.mode === "foodType" && "식품유형은 공식 분류명(예: “빵류”)으로 넣어보세요."}
                </>
              )}
            </p>
          ) : (
            // 모든 모드 → 제품 단위 표 (업체 + 제품을 함께 보여주고 행별로 저장)
            <div className="nt-scroll overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-semibold">제품명</th>
                    <th className="w-36 py-2.5 font-semibold">품목유형</th>
                    <th className="w-36 py-2.5 font-semibold">업체명</th>
                    <th className="w-28 py-2.5 font-semibold">보고일자</th>
                    <th className="w-24 py-2.5 text-center font-semibold">생산상태</th>
                    <th className="w-20 py-2.5 text-center font-semibold">후보</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <ProductRow
                      key={it.reportNo || `${it.company}-${it.product}-${it.reportDate}`}
                      it={it}
                      saved={savedKeys.has(candidateKey(it.company, it.product))}
                      onSave={() => addCandidate(it.company, it.product, `${searched.q} 검색`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
        </>
      )}

      {view === "saved" && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-strong">
              컨택 후보 <span className="font-normal text-muted">(브라우저에 저장)</span>
            </h2>
            <span className="text-xs text-muted">{candidates.length}건</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            검색 결과에서 저장한 후보입니다. <b className="font-semibold">어떤 업체의 어떤 제품</b>을 컨택했는지
            제품 단위로 상태를 관리하세요.
          </p>
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              아직 저장한 후보가 없습니다. 검색 결과에서 <b className="font-semibold">저장</b>을 눌러보세요.
            </p>
          ) : (
            <div className="nt-scroll overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-semibold">제품</th>
                    <th className="py-2.5 font-semibold">업체명</th>
                    <th className="w-28 py-2.5 font-semibold">근거</th>
                    <th className="w-44 py-2.5 font-semibold">컨택 상태</th>
                    <th className="w-16 py-2.5 text-center font-semibold">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const key = candidateKey(c.company, c.product);
                    return (
                      <tr key={key} className="border-b border-[#f0eee9] last:border-0">
                        <td className="py-3 pr-2 font-semibold text-accent-ink">
                          {c.product ? (
                            <ProductLink company={c.company} product={c.product} />
                          ) : (
                            <span className="font-normal text-muted">— (업체 전체)</span>
                          )}
                        </td>
                        <td className="py-3 pr-2 text-[13px] text-muted-strong">
                          <span className="inline-flex items-center gap-1.5">
                            {c.company}
                            {isKnownPartner(c.company) && (
                              <span className="rounded-full bg-accent px-2 py-[2px] text-[10px] font-bold text-white">
                                거래처
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-muted">{c.note}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {(["none", "contacted", "inprogress", "rejected"] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => setStatus(key, s)}
                                className={`rounded-full px-2 py-[3px] text-[11px] font-bold transition-colors ${
                                  c.status === s
                                    ? TONE[CONTACT_META[s].tone]
                                    : "bg-white text-muted hover:text-muted-strong"
                                }`}
                              >
                                {CONTACT_META[s].label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeCandidate(key)}
                            className="text-xs text-muted transition-colors hover:text-down"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ProductRow({
  it,
  saved,
  onSave,
}: {
  it: OdmItem;
  saved: boolean;
  onSave: () => void;
}) {
  const p = productionState(it.production);
  return (
    <tr className="border-b border-[#f0eee9] last:border-0">
      <td className="py-3 pr-2 font-medium text-accent-ink">
        {it.product ? <ProductLink company={it.company} product={it.product} /> : "—"}
      </td>
      <td className="py-3 text-[13px] text-muted-strong">{it.foodType || "—"}</td>
      <td className="py-3 pr-2 text-[13px] text-muted-strong">
        <span className="inline-flex items-center gap-1.5">
          {it.company || "—"}
          {isKnownPartner(it.company) && (
            <span className="rounded-full bg-accent px-1.5 py-[1px] text-[10px] font-bold text-white">
              거래처
            </span>
          )}
        </span>
      </td>
      <td className="py-3 text-[13px] tabular-nums text-muted-strong">
        {formatReportDate(it.reportDate)}
      </td>
      <td className="py-3 text-center">
        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${TONE[p.tone]}`}>
          {p.label}
        </span>
      </td>
      <td className="py-3 text-center">
        <SaveButton saved={saved} onClick={onSave} label="저장" compact />
      </td>
    </tr>
  );
}

function SaveButton({
  saved,
  onClick,
  label,
  compact,
}: {
  saved: boolean;
  onClick: () => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saved}
      className={`whitespace-nowrap rounded-[9px] border px-3 ${compact ? "py-1 text-[11.5px]" : "py-1.5 text-xs"} font-bold transition-colors ${
        saved
          ? "border-line bg-[#f0eee9] text-muted"
          : "border-accent-bright text-accent hover:bg-accent-soft"
      }`}
    >
      {saved ? "저장됨" : label}
    </button>
  );
}

function KeyGuide() {
  return (
    <div className="rounded-2xl border border-[#e8dcae] bg-[#fdfaf0] p-5">
      <h3 className="mb-1 text-sm font-bold text-[#8a6a00]">식품안전나라 인증키가 필요합니다</h3>
      <p className="mb-3 text-xs text-[#8a6a00]">
        별도의 &ldquo;키 발급 페이지&rdquo;는 없습니다.{" "}
        <b className="font-bold">쓰려는 API를 목록에서 선택해 신청</b>하면 자동 승인되어 바로 발급됩니다. (무료)
      </p>
      <ol className="ml-4 list-decimal space-y-2 text-xs leading-relaxed text-[#8a6a00]">
        <li>
          <a
            href="https://foodsafetykorea.go.kr/login.do"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline"
          >
            식품안전나라 회원가입 · 로그인
          </a>{" "}
          — <b className="font-bold">로그인 상태가 아니면 신청 버튼이 보이지 않습니다.</b>
        </li>
        <li>
          <a
            href="https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=656&show_cnt=10&start_idx=1&svc_no=I1250&svc_type_cd=API_TYPE06"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline"
          >
            식품(첨가물)품목제조보고 (I1250)
          </a>{" "}
          페이지에서 해당 API를 <b className="font-bold">체크</b>하고, 우측 상단{" "}
          <b className="font-bold">[Open-API 신청]</b> 버튼을 누릅니다.
        </li>
        <li>
          약관 동의 → 활용목적(애플리케이션 개발) · 사용자유형(개인/기업) 입력 → 신청.{" "}
          <b className="font-bold">신청 즉시 자동 승인</b>됩니다.
        </li>
        <li>
          상단 <b className="font-bold">[인증키 신청 현황]</b> 메뉴에서 발급된 키를 복사합니다.
        </li>
        <li>
          <code className="rounded bg-[#f0eee9] px-1">.env.local</code> 에 넣고 서버를 재시작합니다:
          <br />
          <code className="mt-1 inline-block rounded bg-[#f0eee9] px-2 py-1">
            FOODSAFETY_API_KEY=발급받은키
          </code>
        </li>
      </ol>
      <p className="mt-3 border-t border-[#e8dcae] pt-2.5 text-[11px] leading-relaxed text-[#8a6a00]">
        <b className="font-bold">막히면</b> — 회원가입 본인인증이 안 되면 통합망 고객지원센터{" "}
        <b className="font-bold">1899-5590</b>, 데이터 문의는 식약처 종합상담센터{" "}
        <b className="font-bold">1577-1255</b>.{" "}
        <a
          href="https://www.foodsafetykorea.go.kr/api/howToUseApi.do?menu_grp=MENU_GRP34&menu_no=687"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          공식 이용방법 안내
        </a>
      </p>
    </div>
  );
}
