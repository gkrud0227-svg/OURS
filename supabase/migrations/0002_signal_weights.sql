-- 3단계 — 학습된 신호 가중치(signal_weights). 라벨링 결과로 계산한 버킷 가중치를 한 행에 캐시.
-- discovery_log(원장)와 달리 이건 재계산 가능한 파생값이라 단일 행(id='current')만 유지한다.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

create table if not exists public.signal_weights (
  id         text primary key default 'current',
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.signal_weights enable row level security;

-- "Automatically expose new tables"를 꺼두면 service_role 도 자동 grant 를 못 받으므로 명시.
-- (브라우저 anon/publishable 엔 정책 없음 → 접근 불가. 서버 service_role 만 접근.)
grant all on table public.signal_weights to service_role;

-- 0001 에서 만든 discovery_log 도 동일 이유로 grant 를 보강(이미 부여됐다면 무해).
grant all on table public.discovery_log to service_role;
