-- 전향적 발굴 로그(discovery_log) — 발굴 때마다 "처음 등장한 후보"를 시점·초기신호와 함께 append.
-- 라벨링 단계에서 이 기록을 데이터랩으로 되짚어 hit/dud 를 판정하고 오탐률·정밀도를 낸다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행.

create table if not exists public.discovery_log (
  -- term 을 PK 로 두어 "최초 등장 1회만" 을 DB 수준에서 보장(경합에도 안전).
  term          text primary key,
  source        text,
  first_seen_at timestamptz not null default now(),
  novel         boolean     not null default false,
  lift          double precision,
  df_recent     double precision,
  context_tag   text,
  rise_rate     double precision,
  volume_total  double precision,
  shop_status   text,
  shop_rise     double precision
);

-- 최근 발견 순 조회를 위한 인덱스.
create index if not exists discovery_log_first_seen_idx
  on public.discovery_log (first_seen_at);

-- RLS 켜고 **정책은 두지 않는다** → 브라우저(anon/publishable 키)는 접근 불가.
-- 서버 Route Handler 가 쓰는 **service_role 키만** RLS 를 우회해 읽고 쓴다.
alter table public.discovery_log enable row level security;
