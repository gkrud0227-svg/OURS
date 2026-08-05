-- ODM 거래처 제품 카탈로그 캐시 — 매일 크론이 식약처에서 받아 갱신한다.
-- 식약처가 09:00~19:00 실시간 조회를 제한하므로, 미리 받아둔 이 캐시로 그 시간대에도 응답한다.
--
-- 회사별 한 행(company = 업체명 키)에 rows/total/companies 를 jsonb 로 저장.
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

create table if not exists public.odm_cache (
  company    text primary key,
  data       jsonb       not null,   -- { total, rows[], companies[], fetchedAt }
  fetched_at timestamptz not null default now()
);

alter table public.odm_cache enable row level security;

-- 서버 service_role 만 접근(브라우저 anon/publishable 엔 정책 없음).
grant all on table public.odm_cache to service_role;
