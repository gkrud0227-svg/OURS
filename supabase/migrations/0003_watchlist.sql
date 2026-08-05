-- 저장한 후보(watchlist) 영속화. localStorage 는 브라우저 설정·기기마다 휘발되므로,
-- 사용자가 저장/삭제한 관심 키워드를 서버(Supabase)에 남겨 어디서든 유지되게 한다.
--
-- 단일 사용자 앱이라 한 행(id='current')에 전체 목록을 jsonb 로 저장한다.
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

create table if not exists public.watchlist (
  id         text primary key default 'current',
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.watchlist enable row level security;

-- "Automatically expose new tables"를 꺼둔 프로젝트에선 service_role 도 명시 grant 가 필요하다.
-- (브라우저 anon/publishable 엔 정책 없음 → 접근 불가. 서버 service_role 만 접근.)
grant all on table public.watchlist to service_role;
