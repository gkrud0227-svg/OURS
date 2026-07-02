# NATA TABLE · 트렌드 모니터

식품·디저트 트렌드를 매주 모니터링해서 **급상승 키워드**를 발견하고, **다음 제품 선정**에 활용하는 대시보드입니다.

- **Frontend**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- **차트**: Recharts
- **데이터**: 네이버 검색광고(발굴·검색량) · 네이버 데이터랩(상승률) · YouTube Data API v3 · Instagram Graph API(해시태그) — 모두 서버 프록시

## 워크플로우 (발굴 → 검증 → 결정)

1. **발굴** — 시드 키워드(예: 디저트·베이커리·음료·스낵)에서 네이버 **검색광고 keywordstool**로 연관 키워드와 **월간 검색량(언급량)**을 발굴
2. **트렌드** — 검색량 상위 후보를 **데이터랩**에 넣어 4주 **상승률(%)** 계산
3. **랭킹** — `검색량 × 상승률` 기반 **발굴점수**로 자동 정렬 → 유망 키워드 도출
4. **교차검증** — 유망 키워드를 **YouTube·Instagram** 콘텐츠 증가로 확인
5. **결정** — **스코어카드**로 다음 제품 선정

> 데이터랩 검색어트렌드 API는 "지정 키워드의 상대 트렌드"만 주고 발굴/절대 검색량이 불가하므로, 발굴·검색량은 **검색광고 keywordstool**로 보완합니다.
- **저장**: 브라우저 로컬스토리지 (MVP 단계 · 로그인 불필요)
- **배포**: Vercel

> 왜 순수 React SPA가 아니라 Next.js인가요? 네이버 데이터랩 API는 브라우저에서 직접
> 호출할 수 없고(CORS 차단), `Client Secret`이 노출되면 안 됩니다. 그래서 서버
> Route Handler(`/api/datalab`)가 키를 숨긴 채 대신 호출합니다.

---

## 핵심 기능

1. **키워드 트렌드 조회** — 검색어별 최근 4주 트렌드 그래프, 전주 대비 상승률 자동 계산 (급상승 기준: **전주 대비 30% 이상**)
2. **급상승 키워드 대시보드** — 등록 키워드를 상승률 순으로 정렬, 상태 뱃지(🔥급상승 / 📈상승 / ➡️보합 / 📉하락)
3. **제품 후보 스코어카드** — 5개 기준(트렌드신호·희소성·자판기적합성·소싱가능성·가격적합성) 점수 입력, 총점 자동 계산, **80점 이상 “즉시 진행”**

### 화면
| 경로 | 화면 |
| --- | --- |
| `/` | 메인 대시보드 (급상승 TOP 5 · 전체 상승률 순위 · 마지막 업데이트) |
| `/keywords/[id]` | 키워드 상세 (4주 라인 차트 · 주차별 수치 · 틱톡 언급량 수동 입력) |
| `/scorecard` | 스코어카드 (5개 슬라이더 · 총점 · 즉시진행/조건개선/다음후보) |
| `/keywords` | 키워드 관리 (추가·삭제 · 카테고리 분류) |

> **틱톡 언급량**은 공개 API 제한으로 자동 수집이 어려워, 키워드 상세 화면에서 **수동 입력**으로 지원합니다.

---

## 빠른 시작

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 준비
cp .env.example .env.local
#   → .env.local 을 열어 발급받은 키를 채웁니다 (아래 "API 키 발급" 참고)

# 3) 개발 서버 실행
npm run dev
#   → http://localhost:3000
```

> 키가 없어도 앱은 **샘플 데이터**로 즉시 동작합니다. 키를 넣고 대시보드의
> **“실데이터 갱신”** 버튼을 누르면 실제 네이버 검색 트렌드로 교체됩니다.

---

## 네이버 데이터랩 API 키 발급 방법

1. **네이버 개발자 센터** 접속 → <https://developers.naver.com> (네이버 계정 로그인)
2. 상단 **Application → 애플리케이션 등록** 클릭
3. 정보 입력
   - **애플리케이션 이름**: 예) `nata-trend-monitor`
   - **사용 API**: **데이터랩 (검색어트렌드)** 선택
   - **환경 추가**: `WEB 설정` 선택 후 서비스 URL에 `http://localhost:3000` 입력
     (배포 후에는 Vercel 도메인도 추가)
4. 등록을 완료하면 애플리케이션 상세에서 **Client ID**와 **Client Secret**을 확인할 수 있습니다.
5. 두 값을 아래처럼 `.env.local`에 넣습니다.

> 참고: 검색어 트렌드는 **비로그인 오픈 API**라 Client ID/Secret만 있으면 호출됩니다.
> 일일 호출 한도가 있으니 대량 갱신은 주 1회(월요일) 기준을 권장합니다.

---

## 네이버 검색광고 API 발급 (키워드 발굴 · 검색량)

발굴 대시보드의 핵심 소스입니다. 무료로 발급됩니다.

1. [네이버 검색광고](https://searchad.naver.com) 접속 → 로그인(네이버 계정) → 신규면 광고주 가입
2. 우측 상단 **도구 → API 사용 관리** 이동
3. **네이버 검색광고 API** 라이선스 발급 → 아래 3개 값 확인
   - **액세스 라이선스** → `NAVER_AD_API_KEY`
   - **비밀키(Secret Key)** → `NAVER_AD_SECRET_KEY`
   - **고객 ID(CUSTOMER ID)** → `NAVER_AD_CUSTOMER_ID` (계정 관리 화면 상단에서 확인)
4. `.env.local` 에 세 값을 입력하고 서버 재시작

```env
NAVER_AD_API_KEY=발급받은_액세스_라이선스
NAVER_AD_SECRET_KEY=발급받은_비밀키
NAVER_AD_CUSTOMER_ID=고객_ID
```

> 광고 집행 없이 API만 사용해도 무료입니다. keywordstool은 시드 키워드에서 연관
> 키워드와 월간 검색량(PC/모바일)을 반환합니다. (데이터랩 키와는 별개)

---

## YouTube 연동 (선택)

키워드별 **최근 인기 영상 수 · 평균 조회수 · Shorts 근사 · 최고 조회 영상**을 수집합니다. (대시보드/상세의 “소셜 신호 갱신” 또는 “수집” 버튼)

1. [Google Cloud Console](https://console.cloud.google.com) 에서 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → **YouTube Data API v3** 사용 설정
3. **사용자 인증 정보 → 만들기 → API 키** 생성
4. 키를 `.env.local` 의 `YOUTUBE_API_KEY` 에 입력 후 서버 재시작

> 기본 쿼터 10,000 units/일, 키워드 1개 수집당 약 101 units(search 100 + videos 1) 사용.
> **Shorts**는 API에 별도 구분이 없어 **길이 60초 이하**로 근사합니다.

---

## Instagram 연동 (선택 · 해시태그)

`#키워드`의 **인기 게시물·릴스·좋아요/댓글**을 수집합니다. 인스타 공식 정책상 **해시태그 검색만** 가능하며 준비물이 필요합니다.

**준비물**
- Instagram **비즈니스/크리에이터** 계정 (Facebook 페이지에 연결)
- [Facebook 개발자](https://developers.facebook.com) 앱 — 제품에 **Instagram Graph API** 추가
- 권한: `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `instagram_manage_insights`
- **장기(약 60일) 사용자 액세스 토큰** + 연결된 **IG 비즈니스 계정 ID**

**설정**
1. Facebook 개발자에서 앱 생성 → Instagram Graph API 추가
2. Graph API 탐색기(또는 로그인 플로우)로 위 권한 포함 토큰 발급 → **장기 토큰으로 교환**
3. IG 비즈니스 계정 ID 확인: `GET /me/accounts` → 페이지 → `GET /{page-id}?fields=instagram_business_account`
4. `.env.local` 에 입력 후 서버 재시작:
   - `IG_ACCESS_TOKEN` = 장기 토큰
   - `IG_USER_ID` = IG 비즈니스 계정 ID

> **제약**: 해시태그 검색은 **7일당 30개**로 제한됩니다. 임의 텍스트·릴스 전면 검색은 공식 API로 불가능하고, **해시태그(#키워드) 단위**만 지원됩니다. TikTok은 API 제한으로 계속 **수동 입력**을 사용하세요.

---

## 환경변수 설정

`.env.local` (로컬 개발용, git 에 커밋되지 않음):

```env
NAVER_CLIENT_ID=발급받은_Client_ID
NAVER_CLIENT_SECRET=발급받은_Client_Secret
```

| 변수 | 설명 | 노출 범위 |
| --- | --- | --- |
| `NAVER_CLIENT_ID` | 데이터랩 앱 Client ID | 서버 전용 |
| `NAVER_CLIENT_SECRET` | 데이터랩 앱 Client Secret | 서버 전용 |
| `NAVER_AD_API_KEY` | 검색광고 액세스 라이선스 | 서버 전용 |
| `NAVER_AD_SECRET_KEY` | 검색광고 비밀키 | 서버 전용 |
| `NAVER_AD_CUSTOMER_ID` | 검색광고 고객 ID | 서버 전용 |
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 | 서버 전용 |
| `IG_ACCESS_TOKEN` | Instagram 장기 액세스 토큰 | 서버 전용 |
| `IG_USER_ID` | IG 비즈니스 계정 ID | 서버 전용 |
| `IG_GRAPH_VERSION` | Graph API 버전(기본 `v21.0`) | 서버 전용 |

> `NEXT_PUBLIC_` 접두사를 쓰지 않으므로 두 값은 서버에서만 읽히고 브라우저 번들에
> 포함되지 않습니다. 환경변수를 바꾼 뒤에는 **개발 서버를 재시작**하세요.

---

## Vercel 배포

1. 이 저장소를 GitHub 에 올린 뒤 [Vercel](https://vercel.com) 에서 **New Project → Import**.
2. **Environment Variables** 에 사용하는 키를 등록 (Production / Preview / Development):
   - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
   - `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`, `NAVER_AD_CUSTOMER_ID`
   - (선택) `YOUTUBE_API_KEY`
   - (선택) `IG_ACCESS_TOKEN`, `IG_USER_ID`, `IG_GRAPH_VERSION`
3. 네이버 개발자 센터 애플리케이션의 **서비스 URL**에 배포된 Vercel 도메인을 추가.
4. **Deploy**. Next.js 프로젝트로 자동 인식되어 빌드됩니다.

```bash
# 로컬에서 프로덕션 빌드 검증
npm run build
npm run start
```

---

## 상태 판정 기준

**트렌드 상태 뱃지** (전주 대비 상승률 기준)

| 뱃지 | 조건 |
| --- | --- |
| 🔥 급상승 | +30% 이상 |
| 📈 상승 | +5% ~ +30% |
| ➡️ 보합 | -5% ~ +5% |
| 📉 하락 | -5% 이하 |

**스코어카드 판정** (총점 100점 만점)

| 결과 | 총점 |
| --- | --- |
| 즉시 진행 | 80점 이상 |
| 조건 개선 | 60 ~ 79점 |
| 다음 후보 | 60점 미만 |

---

## 참고 / 한계

- 데이터랩이 제공하는 값은 **절대 검색량이 아니라 상대 검색지수(0–100)** 입니다. 화면에는 “검색지수”로 표기합니다.
- 상대 지수는 요청 묶음(최대 5개 키워드) 내에서 정규화되므로, 서로 다른 키워드의 **절대 수치 비교보다 상승률 비교**에 활용하세요.
- MVP 단계라 데이터는 브라우저 로컬스토리지에 저장됩니다. 브라우저/기기를 바꾸면 데이터가 공유되지 않습니다. (후속 단계에서 Supabase 등 연동 가능)
