-- 범용 앱 상태 저장소(app_state) — 시드 키워드 등 작은 설정값을 key별 jsonb 로 영속화.
-- localStorage 는 브라우저 설정·기기마다 휘발되므로, 사용자가 편집한 시드(추가·삭제)를 서버에 남긴다.
--
-- 현재 사용 key: 'seeds'(국내 시드), 'overseas_seeds'(해외 시드).
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

create table if not exists public.app_state (
  key        text primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- 서버 service_role 만 접근(브라우저 anon/publishable 엔 정책 없음).
grant all on table public.app_state to service_role;
