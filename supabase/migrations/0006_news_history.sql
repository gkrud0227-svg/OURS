-- 식품 뉴스 스캔 이력 — 매일 크론(/api/food-news?region=overseas)이 누적한다.
--
-- 왜 필요한가: RSS 는 최신 며칠치만 준다(실측 0.6~24일). "무엇이 새로 등장했나"를 판정하려면
-- 과거 기준선이 있어야 하는데, 그건 매일 스캔해 쌓는 수밖에 없다. Vercel 함수의 파일시스템은
-- 읽기 전용이라 파일로는 누적이 불가능하다 — 크론이 매일 돌아도 기준선이 비어 모든 용어가
-- new 로 나온다. 그래서 여기에 둔다.
--
-- 구분(region)당 한 행에 { term: { firstSeenAt, lastSeenAt, scans, maxSources, recent[] } } 맵 전체.
-- 용어당 한 행으로 쪼개지 않는 이유: 한 번에 전부 읽고 전부 쓰는 패턴이라 쪼갤 이득이 없고
-- 쓰기가 1만 건 가까이로 늘어난다.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

create table if not exists public.news_history (
  region     text primary key,       -- 'overseas' | 'domestic' | 'all'
  data       jsonb       not null,
  fetched_at timestamptz not null default now()
);

alter table public.news_history enable row level security;

-- 서버 service_role 만 접근(브라우저 anon/publishable 엔 정책 없음).
grant all on table public.news_history to service_role;
