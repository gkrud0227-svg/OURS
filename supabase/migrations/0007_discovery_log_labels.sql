-- 발굴 로그에 라벨 결과를 눌러 담는다.
--
-- 왜 필요한가: 라벨링은 후보마다 데이터랩 주간 곡선을 단독 조회해야 해서 느리다
-- (실측: 30건에 123초 — 건당 4초). 결과를 저장하지 않으면 화면을 닫는 순간 사라지고,
-- 다음에 볼 때 405건을 처음부터 다시 조회해야 한다. 실제로 그래서 8월 이후 라벨링이
-- 한 번도 완주하지 못했다.
--
-- 판정 결과를 여기 남기면 (1) 화면은 즉시 뜨고 (2) 새로 쌓인 후보만 이어서 판정하면 되고
-- (3) 가중치 재학습이 전체 표본을 쓸 수 있다.
--
-- ⚠️ label 은 'hit' | 'dud' | 'pending'. pending 은 아직 관측 창(4주)이 안 지난 것으로,
--    분모에서 빼야 한다(성숙 전 항목을 dud 로 세면 오탐률이 부풀려지는 censoring 오류).
--    pending 도 저장하되 labeled_at 을 남겨 "언제 판정을 시도했는지"를 알 수 있게 한다.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 실행.

alter table public.discovery_log
  add column if not exists label          text,
  add column if not exists labeled_at     timestamptz,
  add column if not exists observed_weeks integer,
  add column if not exists peak_rise      double precision,
  add column if not exists label_reason   text;

-- 아직 판정 안 한 후보만 골라내는 조회가 잦다.
create index if not exists discovery_log_label_idx on public.discovery_log (label);
