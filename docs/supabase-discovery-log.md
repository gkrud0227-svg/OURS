# 전향적 발굴 로그 — Supabase 영속화 (0단계)

## 왜 필요한가

전향적 로그는 발굴 때마다 "처음 등장한 후보"를 시점과 함께 남겨, 나중에 **오탐률·정밀도**
(`/label` 실제 로그 라벨링)를 계산하는 자산이다. 그런데 로컬 파일(`data/discovery-log.json`)은
**Vercel 등 서버리스에서 휘발**한다. 로그가 안 쌓이면 라벨링이 영원히 pending이므로, 배포에는
Supabase 영속화가 전제다.

## 동작 방식 (코드)

- 저장소 추상화: [`src/lib/discovery-log-store.ts`](../src/lib/discovery-log-store.ts)
  - Supabase 키가 **있으면** `discovery_log` 테이블에, **없으면** 로컬 파일에 쓴다.
  - 어느 쪽이든 **최초 등장(firstSeenAt) dedup** 의미는 동일.
- 서버 전용 클라이언트: [`src/lib/supabase.ts`](../src/lib/supabase.ts) — env 없으면 `null` → 파일 폴백.
- 쓰기: `POST /api/discovery-log` (발굴 시 자동). 읽기: `GET /api/discovery-log`, `GET /api/discovery-label`.
- 응답의 `persisted` 필드로 현재 모드 확인: `true`=Supabase(영속), `false`=파일(휘발).

## 설정 순서

1. **Supabase 프로젝트**가 없으면 만든다 (supabase.com).
2. **테이블 생성** — 대시보드 → SQL Editor에 아래 파일 전체를 붙여넣고 실행:
   - [`supabase/migrations/0001_discovery_log.sql`](../supabase/migrations/0001_discovery_log.sql)
   - RLS가 켜지고 정책은 없음 → 브라우저(publishable 키)는 접근 불가, 서버(service_role)만 접근.
3. **키 확보** — Supabase 대시보드 → Project Settings → API:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` 키(secret) → `SUPABASE_SERVICE_ROLE_KEY` **(서버 전용 비밀, 절대 브라우저/깃 노출 금지)**
4. **로컬**: 위 두 값을 `.env.local`에 넣는다. (`.env.local`은 커밋되지 않는다)
5. **Vercel**: Project → Settings → Environment Variables에 같은 두 변수를 등록(Production/Preview).
6. 확인: `GET /api/discovery-log` 응답의 `persisted`가 `true`면 영속화가 켜진 것.

## 검증

- 키를 넣기 전에도 앱은 **파일 폴백으로 정상 작동**한다(기존과 동일).
- 키를 넣은 뒤:
  ```
  POST /api/discovery-log  {"candidates":[{"term":"테스트어","novel":true}]}
  GET  /api/discovery-log   → entries 에 반영, persisted:true
  ```
- 이후 발굴을 꾸준히 돌려 로그가 쌓이고 8주(window)가 지나면, `/label`의 **실제 로그 라벨링**이
  pending을 벗어나 진짜 오탐률·정밀도를 낸다 → 3단계(피드백)의 연료.

## 참고

- 지금은 `discovery_log`만 영속화한다. 편집 lift용 `news-history.json`은 별도이며, 필요 시 같은 패턴으로
  옮길 수 있다.
