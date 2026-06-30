# Studiooalum 백업 및 마이그레이션 가이드

**버전:** 1.0  
**작성일:** 2026-06-30  
**목적:** 프로젝트를 다른 환경에서도 완벽히 복원할 수 있도록 필요한 모든 설정 정보를 정리

---

## 📋 목차

1. [개요](#개요)
2. [인프라 및 계정 정보](#인프라-및-계정-정보)
3. [환경변수 및 인증 키](#환경변수-및-인증-키)
4. [데이터베이스 마이그레이션](#데이터베이스-마이그레이션)
5. [Cloudflare 설정](#cloudflare-설정)
6. [배포 및 도메인](#배포-및-도메인)
7. [외부 서비스 통합](#외부-서비스-통합)
8. [백업 체크리스트](#백업-체크리스트)
9. [복원 절차](#복원-절차)

---

## 개요

### 현재 아키텍처

```
GitHub Pages (정적 프론트엔드) ──┐
                              ├─→ studiooalum.com (Cloudflare 역프록시)
Cloudflare Pages/Workers       ──┘
     ├── /api/* (주문, 결제, 인증)
     ├── D1 Database (주문 저장)
     └── Workers (비즈니스 로직)
```

### 주요 서비스

| 서비스 | 목적 | 상태 |
|--------|------|------|
| **Cloudflare** | 도메인, DNS, Pages/Workers 런타임 | 🟢 Live |
| **D1** | 주문/결제/배송 데이터 저장 | 🟢 Live |
| **Sanity** | 제품/에디션 콘텐츠 CMS | 🟢 Live |
| **Toss Payments** | 결제 게이트웨이 | 🟢 Live |
| **Google Sheets** | 주문 동기화 및 알림 | 🟡 선택사항 |
| **Delivery Tracker** | 배송 추적 | 🟡 선택사항 |
| **Resend** | 이메일 발송 | 🟡 준비중 |

---

## 인프라 및 계정 정보

### Cloudflare

**필수 정보:**

```
계정 타입: Paid (Workers 사용)
Organization Name: [사용자 정보]
Account ID: [수집 필요]
API Token Scope: Pages, Workers, D1 관리
```

**확인 방법:**
```bash
# 현재 로그인 상태 확인
wrangler whoami

# Account ID 확인
wrangler deployments list --name studiooalum

# Pages 프로젝트 정보 확인
wrangler pages project list
```

**Pages Project:**
- 프로젝트명: `studiooalum`
- GitHub Repository: `studiooalum/studiooalum.github.io`
- Build Output Directory: `./dist`
- GitHub Integration: 활성화 (main 브랜치 자동 배포)

### GitHub

**저장소 정보:**
- Owner: `studiooalum`
- Repository: `studiooalum.github.io`
- Branch: `main` (기본 브랜치)
- Type: Public (Pages 호스팅용)
- Actions: Cloudflare Pages 자동 배포

**GitHub Pages 설정:**
- 호스팅: GitHub Pages (정적 콘텐츠만)
- Build Method: GitHub Pages legacy build
- 배포 경로: `main` 브랜치 루트 (/)

### 도메인 등록처

**도메인:**
- Domain: `studiooalum.com`
- Registrar: Gabia (가비아)
- Nameserver: Cloudflare (NS 레코드 변경됨)
- SSL/TLS: Cloudflare 관리

---

## 환경변수 및 인증 키

### 1. Cloudflare Pages 환경변수

**프로덕션 배포 (studiooalum.com):**

#### 결제 관련

```
NEXT_PUBLIC_TOSS_CLIENT_KEY = "pk_live_xxxxxxxxxxxxx"
TOSS_SECRET_KEY = "sk_live_xxxxxxxxxxxxx"
TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm"
```

**보관 위치:**
- Cloudflare Dashboard → Pages → studiooalum → Settings → Environment variables
- 유형: Production Deployment

**설명:**
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`: 클라이언트 측 결제 위젯 키 (공개 가능)
- `TOSS_SECRET_KEY`: 서버 측 결제 확인용 비밀 키 (⚠️ 절대 공개 금지)

#### CMS 및 API

```
NEXT_PUBLIC_SANITY_PROJECT_ID = "9bsud0bl"
NEXT_PUBLIC_SANITY_DATASET = "production"
SANITY_API_VERSION = "2023-01-01"
SANITY_USE_CDN = "true"
```

**설명:**
- Sanity 공개 프로젝트이므로 API 토큰 불필요
- CDN 사용으로 캐싱 성능 최적화

#### 인증 및 보안

```
SESSION_COOKIE_NAME = "oalum_session"
AUTH_COOKIE_INSECURE = "false"
ORDER_ADMIN_SECRET = "xxxxxxxxxxxxx"
```

**설명:**
- `SESSION_COOKIE_NAME`: 인증 세션 쿠키명
- `AUTH_COOKIE_INSECURE`: 로컬 개발 환경에서만 true (HTTPS 불필요)
- `ORDER_ADMIN_SECRET`: 주문 조회/취소 API 인증용

#### 주문 동기화 (선택사항)

```
ORDER_SYNC_WEBHOOK_URL = "https://script.google.com/macros/d/xxxxxxxxxxxxx/userweb"
ORDER_SYNC_SHARED_SECRET = "xxxxxxxxxxxxx"
ORDER_NOTIFICATION_EMAILS = "orders@studiooalum.com,admin@studiooalum.com"
```

**설명:**
- Google Sheets Apps Script 웹앱 URL
- 주문 생성/결제 완료/취소 시 Google Sheets에 자동 기록
- 이메일 알림 옵션

#### 배송 추적 (선택사항)

```
DELIVERY_TRACKER_CLIENT_ID = "xxxxxxxxxxxxx"
DELIVERY_TRACKER_CLIENT_SECRET = "xxxxxxxxxxxxx"
DELIVERY_TRACKER_WEBHOOK_SECRET = "xxxxxxxxxxxxx"
DELIVERY_TRACKER_WEBHOOK_URL = "https://studiooalum.com/api/webhooks/delivery-tracker"
```

**설명:**
- Delivery Tracker API 인증
- 배송 상태 실시간 추적

#### 기타

```
CLOUDFLARE_WEB_ANALYTICS_TOKEN = "xxxxxxxxxxxxx"
```

**설명:**
- Cloudflare Web Analytics 토큰 (선택사항)

### 2. 환경별 변수 값

#### 로컬 개발 환경 (.env.local)

```bash
# .env.local 파일 (버전 관리 제외)
AUTH_COOKIE_INSECURE=true
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_test_xxxxxxxxxxxxx  # Toss 테스트 키
TOSS_SECRET_KEY=sk_test_xxxxxxxxxxxxx
ORDER_ADMIN_SECRET=dev_secret_key
OALUM_STRICT_PERSISTENCE=false
```

**주의:**
- `.env.local`은 `.gitignore`에 포함 (버전 관리 제외)
- 로컬 D1 바인딩은 `wrangler` 자동 제공

#### 스테이징 환경

```bash
# Cloudflare Pages Preview 배포
# Dashboard에서 Preview Alias 생성
# Toss 테스트 환경 키 사용
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_test_xxxxxxxxxxxxx
TOSS_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

#### 프로덕션 환경

```bash
# Cloudflare Pages Production 배포
# Toss 실결제 키 사용
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_live_xxxxxxxxxxxxx
TOSS_SECRET_KEY=sk_live_xxxxxxxxxxxxx
```

### 3. 환경변수 관리 체계

#### 보안 등급별 저장소

| 등급 | 변수 | 저장소 | 접근 | 비고 |
|------|------|--------|------|------|
| 🔴 극비 | `TOSS_SECRET_KEY` | Cloudflare 전용 | 관리자만 | 절대 Git 저장금지 |
| 🔴 극비 | `ORDER_ADMIN_SECRET` | Cloudflare 전용 | 관리자만 | 주문 관리 API 보호 |
| 🟡 비공개 | `ORDER_SYNC_WEBHOOK_URL` | Cloudflare 전용 | 개발팀 | Google Apps Script URL |
| 🟠 민감정보 | `DELIVERY_TRACKER_CLIENT_SECRET` | Cloudflare 전용 | 개발팀 | 배송 추적 API |
| 🟢 공개 | `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 공개 가능 | 모두 | 클라이언트 측 사용 |
| 🟢 공개 | `NEXT_PUBLIC_SANITY_PROJECT_ID` | 공개 가능 | 모두 | 콘텐츠 조회용 |

#### 접근 방식

**Cloudflare 환경변수 추가/수정:**

```bash
# 프로덕션 배포에 변수 추가
npm run cf:pages:deploy  # 배포 전에 Dashboard에서 수동으로 설정

# 또는 Wrangler CLI로 직접 설정 (로컬)
wrangler pages deployment tail  # 로그 확인

# Dashboard 경로:
# Pages → studiooalum → Settings → Environment variables → Production
```

---

## 데이터베이스 마이그레이션

### D1 데이터베이스 정보

#### 기본 정보

```
Database Name: oalum-orders
Database ID: 3dcf3c2e-9176-471c-8da2-ffca1dc2e9cb
Binding Name: OALUM_DB
Account: [Cloudflare Account]
```

#### 스키마 구조

**현재 테이블:**

1. **orders** - 주문 정보
   - PK: `id` (TEXT)
   - FK: `user_id` (users.id)
   - 주요 칼럼: `order_name`, `status`, `payment_status`, `total_amount`, `customer_*`
   - 포인트/쿠폰 정보 포함
   - 위치: `cloudflare/d1/schema.sql`

2. **order_items** - 주문 상품 라인
   - PK: `id` (INTEGER AUTOINCREMENT)
   - FK: `order_id` (orders.id)
   - 주요 칼럼: `product_id`, `title`, `quantity`, `unit_price`

3. **shipments** - 배송 정보
   - PK: `id` (INTEGER)
   - FK: `order_id` (orders.id, UNIQUE)
   - 주요 칼럼: `status`, `carrier`, `tracking_number`

4. **payments** - 결제 기록
   - PK: `id` (INTEGER)
   - FK: `order_id` (orders.id)
   - 주요 칼럼: `payment_key`, `amount`, `status`, `provider`

5. **payment_events** - 결제 이벤트 로그
   - PK: `id` (INTEGER)
   - FK: `payment_id` (payments.id)
   - 주요 칼럼: `status`, `event_type`, `raw_response`

6. **users** - 사용자 계정
   - PK: `id` (TEXT)
   - 주요 칼럼: `email`, `name`, `password_hash`, `phone`
   - 포인트/동의 정보 포함

7. **auth_identities** - OAuth 계정 연결
   - FK: `user_id` (users.id)
   - 주요 칼럼: `provider`, `provider_user_id`

8. **auth_sessions** - 로그인 세션
   - PK: `id` (TEXT)
   - FK: `user_id` (users.id)
   - 주요 칼럼: `token`, `expires_at`

9. **auth_login_codes** - 이메일 로그인 코드
   - PK: `id` (TEXT)
   - FK: `user_id` (users.id)
   - 주요 칼럼: `code`, `expires_at`

10. **workshop_reservations** - 워크숍 예약
    - PK: `id` (TEXT)
    - FK: `user_id` (users.id)
    - 주요 칼럼: `workshop_id`, `status`, `reserved_at`

11. **coupons** - 쿠폰 마스터
    - PK: `id` (TEXT)
    - 주요 칼럼: `code`, `title`, `discount_type`, `max_uses`, `expires_at`

12. **coupon_redemptions** - 쿠폰 사용 기록
    - FK: `coupon_id` (coupons.id), `order_id` (orders.id)
    - 주요 칼럼: `redeemed_at`, `status`

13. **point_transactions** - 포인트 거래 로그
    - PK: `id` (INTEGER)
    - FK: `user_id` (users.id)
    - 주요 칼럼: `points`, `transaction_type`, `order_id`

#### 마이그레이션 파일 위치

```
cloudflare/d1/
├── schema.sql                      # 전체 스키마
├── migrations/
│   ├── 0002_auth_oauth.sql        # OAuth 계정 연결 추가
│   ├── 0003_password_auth.sql     # 비밀번호 기반 인증
│   ├── 0003_workshop_reservations.sql  # 워크숍 예약
│   ├── 0004_shipments.sql         # 배송 정보
│   ├── 0005_loyalty_points.sql    # 포인트 시스템
│   └── 0006_coupons.sql           # 쿠폰 시스템
```

### 마이그레이션 절차

#### 1단계: 스키마 생성

```bash
# 새 D1 데이터베이스 생성 (이미 생성된 경우 스킵)
wrangler d1 create oalum-orders

# 스키마 적용
wrangler d1 execute oalum-orders --file=cloudflare/d1/schema.sql --local
wrangler d1 execute oalum-orders --file=cloudflare/d1/schema.sql --remote
```

#### 2단계: 마이그레이션 적용

```bash
# 마이그레이션 파일 순서대로 적용 (필요한 것만)
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0002_auth_oauth.sql --remote
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0003_password_auth.sql --remote
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0004_shipments.sql --remote
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0005_loyalty_points.sql --remote
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0006_coupons.sql --remote
```

#### 3단계: 스키마 검증

```bash
# 테이블 목록 확인
wrangler d1 execute oalum-orders "SELECT name FROM sqlite_master WHERE type='table';" --remote

# 특정 테이블 구조 확인
wrangler d1 execute oalum-orders "PRAGMA table_info(orders);" --remote

# 데이터 건수 확인
wrangler d1 execute oalum-orders "SELECT COUNT(*) as count FROM orders;" --remote
```

#### ⚠️ 주의사항

**문서화된 문제:**
- 2026-05-14에 원격 마이그레이션이 중복 칼럼 오류를 반환했지만 실제로는 적용됨
- **항상 재시도 전에 `PRAGMA table_info(...)`와 `sqlite_master`로 실제 스키마 검증**

```bash
# 마이그레이션 상태 확인 (필수)
wrangler d1 execute oalum-orders "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --remote
```

---

## Cloudflare 설정

### Pages 프로젝트 설정

#### 프로젝트 정보

```
Settings → Pages → studiooalum
├── Project Name: studiooalum
├── GitHub Repository: studiooalum/studiooalum.github.io
├── Production Branch: main
├── Build Configuration:
│   ├── Framework: None (custom)
│   ├── Build Command: npm run cf:build
│   ├── Build Output Directory: ./dist
│   ├── Root Directory: . (저장소 루트)
└── Build Caching: Enabled
```

#### 환경변수 설정

```
Settings → Pages → studiooalum → Environment variables

프로덕션 배포:
  ├── NEXT_PUBLIC_TOSS_CLIENT_KEY = pk_live_*
  ├── TOSS_SECRET_KEY = sk_live_*
  ├── NEXT_PUBLIC_SANITY_PROJECT_ID = 9bsud0bl
  ├── NEXT_PUBLIC_SANITY_DATASET = production
  ├── ORDER_ADMIN_SECRET = *
  ├── ORDER_SYNC_WEBHOOK_URL = (선택사항)
  ├── ORDER_SYNC_SHARED_SECRET = (선택사항)
  ├── DELIVERY_TRACKER_CLIENT_ID = (선택사항)
  ├── DELIVERY_TRACKER_CLIENT_SECRET = (선택사항)
  └── ... (기타)

미리보기 배포:
  └── NEXT_PUBLIC_TOSS_CLIENT_KEY = pk_test_*
      TOSS_SECRET_KEY = sk_test_*
      (프로덕션과 동일한 구조, 테스트 키만 다름)
```

### D1 바인딩 설정

```
Settings → Pages → studiooalum → Functions → D1 Database Bindings

Production:
  ├── Variable Name: OALUM_DB
  ├── Database: oalum-orders
  └── Binding Type: D1

Preview (선택사항):
  └── 로컬 개발용 자동 설정 (wrangler 관리)
```

### 라우팅 설정

```
_routes.json (저장소 루트)

{
  "version": 1,
  "include": [
    "/api/*"
  ],
  "exclude": [
    "/api/health",
    "/api/sanity/*"
  ]
}
```

**설명:**
- `/api/*` 경로만 Functions 런타임 사용
- 정적 파일은 GitHub Pages에서 직접 제공

### 커스텀 헤더 및 리다이렉트

```
_headers (저장소 루트)

# 캐싱 정책
/runtime/storefront/*
  Cache-Control: public, max-age=31536000, immutable

/dist/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=3600

# 보안 헤더
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

```
_redirects (저장소 루트)

# Clean URL 리다이렉트
/shop /shop.html 200
/product /product.html 200
/checkout /checkout.html 200
/payment /payment.html 200
/success /success.html 200
/fail /fail.html 200
/account /account.html 200
/admin /admin.html 200

# 레거시 경로
/v1/* /archive/legacy/v1/:splat 200
```

---

## 배포 및 도메인

### 도메인 설정

#### DNS 레코드

```
Domain: studiooalum.com
Registrar: Gabia
Nameserver: Cloudflare (NS1-NS4)

DNS Records (Cloudflare):

Type    Name                    Content              TTL      Proxied
────────────────────────────────────────────────────────────────────
CNAME   studiooalum.com         pages.cluster.cloudflare.net
CNAME   www.studiooalum.com     pages.cluster.cloudflare.net
TXT     @                       v=spf1 include:...   Auto     No
MX      @                       mail.studiooalum.com  Auto     No
```

**설정 방법:**
1. Cloudflare Dashboard → Domains → studiooalum.com
2. DNS 레코드 추가 → CNAME 설정
3. GitHub Pages 커스텀 도메인 설정 확인

#### SSL/TLS

```
Cloudflare Dashboard → SSL/TLS

설정:
├── Encryption Level: Full (strict)
├── Always Use HTTPS: On
├── Minimum TLS Version: TLS 1.2
├── Certificate Status: Active
└── Auto Renewal: Enabled
```

### 배포 파이프라인

#### GitHub Actions (GitHub Pages)

```
Trigger: main 브랜치 push
├── Event: push
├── Branch: main
├── Action: GitHub Pages deployment
└── 배포 경로: https://studiooalum.github.io

정적 콘텐츠 포함:
  ├── index.html, shop.html, product.html 등
  ├── runtime/storefront/styles/*
  ├── runtime/storefront/scripts/*
  └── public/* 자산
```

#### Cloudflare Pages (API & 통합)

```
Trigger: main 브랜치 push (또는 수동)
├── GitHub Integration: Enabled
├── Build Command: npm run cf:build
├── Output Directory: ./dist
└── Environment: Production

배포 경로: https://studiooalum.com

포함 콘텐츠:
  ├── functions/api/* (Workers)
  ├── D1 바인딩
  ├── 정적 파일 (dist/)
  └── 환경변수 (프로덕션)
```

**배포 확인:**

```bash
# GitHub Pages 상태
gh api repos/studiooalum/studiooalum.github.io/pages

# Cloudflare Pages 상태
wrangler pages deployments list --name studiooalum

# 라이브 엔드포인트 테스트
curl https://studiooalum.com/api/health
curl https://studiooalum.pages.dev/api/health
```

### 배포 전 체크리스트

```bash
# 1. 빌드 검증
npm run cf:build

# 2. dist 디렉토리 확인
ls -la dist/

# 3. 환경변수 확인
wrangler pages project view --name studiooalum

# 4. 로컬 테스트
npm run cf:pages:dev

# 5. 로그인 상태 확인
wrangler whoami

# 6. 배포
npm run cf:pages:deploy
```

---

## 외부 서비스 통합

### 1. Toss Payments

#### 계정 정보

```
Business Type: 일반인 (자영업자)
Account Status: Active
Region: Korea (KRW)
```

**대시보드:** https://dashboard.tosspayments.com

#### API 키 관리

```
Client Key (공개):
  ├── 환경: 테스트
  │   └── pk_test_xxxxxxxxxxxxx
  └── 환경: 실결제
      └── pk_live_xxxxxxxxxxxxx

Secret Key (비밀):
  ├── 환경: 테스트
  │   └── sk_test_xxxxxxxxxxxxx
  └── 환경: 실결제
      └── sk_live_xxxxxxxxxxxxx
```

**키 재발급:**
```
Dashboard → Settings → API Keys → 재발급
(기존 키 자동 무효화)
```

#### Webhook 설정

```
Webhook URL: https://studiooalum.com/api/webhooks/toss
Events:
  ├── payments.confirmed
  ├── payments.cancelled
  ├── payments.refunded
  └── payments.failed

Secret: ORDER_ADMIN_SECRET
```

**설정 위치:**
```
Dashboard → Settings → Webhook
```

### 2. Sanity CMS

#### 프로젝트 정보

```
Project ID: 9bsud0bl
Organization: Sanity
Project URL: https://sanity.io/manage/projects/9bsud0bl
```

#### 데이터셋

```
Production Dataset:
  ├── Name: production
  ├── Access Level: Public (토큰 불필요)
  ├── API Version: 2023-01-01
  └── CDN: Enabled
```

#### API 토큰 (필요 시)

```
용도별 토큰:
  ├── 읽기전용: [생성 필요 시]
  ├── 쓰기권한: [관리자만]
  └── 배포: [CI/CD 전용]

토큰 생성:
  Dashboard → 프로젝트 → API → Tokens → Add API Token
```

### 3. Google Sheets 주문 동기화 (선택사항)

#### 설정 구조

```
Google Sheet: Studiooalum Orders
  ├── Bound Script: Apps Script (내장)
  ├── URL: https://script.google.com/macros/d/xxxxxxxxxxxxx/userweb
  └── 함수: doPost(e) 웹훅 수신
```

#### 데이터 구조

```
Sheets 탭:
  ├── "Orders" - 주문 마스터
  │   └── 칼럼: OrderID, CustomerName, Total, Status, CreatedAt
  ├── "OrderItems" - 상품 라인
  │   └── 칼럼: OrderID, ProductID, Title, Quantity, Price
  ├── "Payments" - 결제 정보
  │   └── 칼럼: OrderID, Amount, Status, ApprovedAt
  └── "Notifications" - 발송 이력
      └── 칼럼: EventType, OrderID, EmailKey, SentAt
```

#### Cloudflare 환경변수

```
ORDER_SYNC_WEBHOOK_URL = "https://script.google.com/macros/d/xxxxxxxxxxxxx/userweb"
ORDER_SYNC_SHARED_SECRET = "[Google Apps Script에서 생성한 비밀키]"
ORDER_NOTIFICATION_EMAILS = "orders@studiooalum.com,admin@studiooalum.com"
```

#### 웹훅 이벤트

```
이벤트 타입 | 발송 조건 | 이메일 발송 | 시트 업데이트
────────────┼──────────┼──────────┼──────────
order.created | 주문 생성 | X | O
payment.confirmed | 결제 완료 | O | O
payment.pending | 결제 대기 | X | O
payment.authorized | 결제 승인대기 | X | O
payment.failed | 결제 실패 | O | O
payment.cancelled | 결제 취소 | O | O
payment.refunded | 환불 완료 | O | O
payment.updated | 상태 변경 | X | O
```

### 4. Delivery Tracker (선택사항)

#### 계정 정보

```
Service: tracker.delivery
Account Status: [필요 시 설정]
GraphQL Endpoint: https://apis.tracker.delivery/graphql
```

#### API 인증

```
클라이언트 ID: [필요 시 발급]
클라이언트 비밀: [필수 보관]
Webhook 비밀: [선택사항]
```

#### Cloudflare 환경변수

```
DELIVERY_TRACKER_CLIENT_ID = "xxxxxxxxxxxxx"
DELIVERY_TRACKER_CLIENT_SECRET = "xxxxxxxxxxxxx"
DELIVERY_TRACKER_WEBHOOK_SECRET = "[선택사항]"
DELIVERY_TRACKER_WEBHOOK_URL = "https://studiooalum.com/api/webhooks/delivery-tracker"
```

---

## 백업 체크리스트

### 📋 사전 준비물

- [ ] Cloudflare 계정 접근권한
- [ ] GitHub 저장소 접근권한
- [ ] Toss Payments 대시보드 접근
- [ ] Sanity 프로젝트 접근
- [ ] Google Sheets (있는 경우)

### 🔐 인증 정보 백업

**격주 또는 변경 시 수행:**

```bash
# 1. 환경변수 내보내기 (수동)
# Cloudflare Dashboard → Pages → studiooalum → Settings → Environment variables
# 각 변수를 별도 암호화된 저장소에 기록

# 2. API 토큰 확인
wrangler whoami

# 3. D1 바인딩 확인
wrangler d1 list

# 4. 도메인 설정 확인
# Cloudflare Dashboard → Domains → studiooalum.com
```

### 💾 데이터베이스 백업

**매주 수행:**

```bash
# D1 전체 내보내기
wrangler d1 export oalum-orders > backup-d1-$(date +%Y%m%d).sql --remote

# 특정 테이블 내보내기
wrangler d1 execute oalum-orders ".dump orders" --remote > backup-orders-$(date +%Y%m%d).sql

# 데이터 양 확인
wrangler d1 execute oalum-orders "SELECT name, COUNT(*) as count FROM (...) GROUP BY name;" --remote
```

**저장 위치:**
- 로컬: `./backups/` 디렉토리 (`.gitignore`에 포함)
- 클라우드: Google Drive 또는 암호화된 저장소

### 📄 문서 백업

**분기별 또는 변경 시:**

```bash
# docs/ 디렉토리 전체 아카이브
tar czf backup-docs-$(date +%Y%m%d).tar.gz docs/

# 이 가이드 포함
tar czf backup-docs-$(date +%Y%m%d).tar.gz docs/ backup-and-migration-guide.md
```

### 🔧 설정 파일 백업

**월 1회:**

```bash
# Wrangler 설정
cp wrangler.jsonc backup/wrangler.jsonc.bak

# _routes.json, _headers, _redirects
cp _routes.json _headers _redirects backup/
```

### 📝 변경 이력 기록

**매 변경 후 즉시:**

```
백업 로그 예시:

2026-06-30
  - TOSS_SECRET_KEY 재발급 (pk_live_xxxx → pk_live_yyyy)
  - D1 마이그레이션 #0006_coupons 적용
  - Delivery Tracker 통합 (환경변수 추가)

2026-06-15
  - ORDER_SYNC_WEBHOOK_URL 변경
  - Google Sheets 기본 템플릿 완성
```

---

## 복원 절차

### 시나리오 1: 새로운 Cloudflare 계정에서 복원

#### 1단계: 프로젝트 세팅

```bash
# 저장소 클론
git clone https://github.com/studiooalum/studiooalum.github.io.git
cd studiooalum.github.io

# 패키지 설치
npm install

# Wrangler 로그인 (새 계정)
wrangler login
# 또는 API 토큰으로 인증
export CLOUDFLARE_API_TOKEN="xxxxxxxxxxxxx"
wrangler whoami
```

#### 2단계: D1 데이터베이스 복원

```bash
# 1. 새 D1 데이터베이스 생성
wrangler d1 create oalum-orders

# 2. 데이터베이스 ID를 wrangler.jsonc에 업데이트
# 이전 ID: 3dcf3c2e-9176-471c-8da2-ffca1dc2e9cb
# 새로운 ID를 반영

# 3. 스키마 복원
wrangler d1 execute oalum-orders --file=cloudflare/d1/schema.sql --remote

# 4. 마이그레이션 적용
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/0002_auth_oauth.sql --remote
# ... (필요한 마이그레이션 모두 적용)

# 5. 기존 데이터 복원 (백업 파일 있는 경우)
wrangler d1 execute oalum-orders --file=backup-d1-20260615.sql --remote
```

#### 3단계: Pages 프로젝트 생성

```bash
# 수동으로 생성 (권장)
# 1. Cloudflare Dashboard → Pages → Create Project
# 2. GitHub 저장소 연결
# 3. 빌드 설정:
#    - Framework: None
#    - Build Command: npm run cf:build
#    - Build Output: ./dist
# 4. 환경변수 설정 (아래 참조)
```

#### 4단계: 환경변수 설정

```bash
# Cloudflare Dashboard → Pages → studiooalum → Settings → Environment variables

프로덕션 배포:
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_live_xxxxxxxxxxxxx
TOSS_SECRET_KEY=sk_live_xxxxxxxxxxxxx
NEXT_PUBLIC_SANITY_PROJECT_ID=9bsud0bl
NEXT_PUBLIC_SANITY_DATASET=production
ORDER_ADMIN_SECRET=[백업에서 복사]
ORDER_SYNC_WEBHOOK_URL=[필요 시]
ORDER_SYNC_SHARED_SECRET=[필요 시]
DELIVERY_TRACKER_CLIENT_ID=[필요 시]
DELIVERY_TRACKER_CLIENT_SECRET=[필요 시]
```

#### 5단계: 도메인 연결

```bash
# Cloudflare DNS 설정
# 1. 도메인 보관업체에서 NS 레코드를 Cloudflare로 변경
# 2. Cloudflare DNS 레코드 추가:
#    - CNAME studiooalum.com → pages.cluster.cloudflare.net
#    - CNAME www.studiooalum.com → pages.cluster.cloudflare.net
# 3. SSL/TLS 활성화 (자동)

# 검증
nslookup studiooalum.com
curl -I https://studiooalum.com/api/health
```

#### 6단계: 배포 및 테스트

```bash
# 로컬 테스트
npm run cf:pages:dev

# 프로덕션 배포
npm run cf:pages:deploy

# 라이브 확인
curl https://studiooalum.com/api/health
curl https://studiooalum.com/shop.html
```

### 시나리오 2: 로컬 개발 환경 재구성

```bash
# 1. 저장소 클론
git clone https://github.com/studiooalum/studiooalum.github.io.git

# 2. 패키지 설치
npm install

# 3. 로컬 환경변수 파일 생성
cat > .env.local << EOF
AUTH_COOKIE_INSECURE=true
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_test_xxxxxxxxxxxxx
TOSS_SECRET_KEY=sk_test_xxxxxxxxxxxxx
ORDER_ADMIN_SECRET=local_dev_secret
OALUM_STRICT_PERSISTENCE=false
EOF

# 4. 로컬 D1 초기화 (자동)
# wrangler pages dev가 처음 실행될 때 자동으로 local.db 생성

# 5. 로컬 개발 서버 시작
npm run cf:pages:dev

# 6. 브라우저에서 확인
open http://localhost:8788
```

### 시나리오 3: 데이터 마이그레이션 (Postgres로 전환)

**미래 목표: 전체 앱 방향으로의 이전**

```
현재 상태 (D1):
  └── Cloudflare Pages + D1 (저비용)

목표 상태 (Postgres + Vercel):
  └── Vercel + Postgres + apps/web

이전 단계:

1. apps/web 프로덕션 준비
   - API 라우트 완성 (DB insert 포함)
   - Toss 서버 승인 통합
   - 환경변수 설정 완료

2. Postgres 인스턴스 생성
   - Railway, Supabase 등 선택
   - schema-postgres.sql 적용

3. D1 → Postgres 데이터 이관
   wrangler d1 export > export.sql
   # SQLite → Postgres 변환
   # INSERT 문 재작성

4. Vercel 배포
   - 환경변수 설정
   - GitHub 연결
   - 배포 확인

5. DNS 전환
   - old.studiooalum.com → GitHub Pages
   - studiooalum.com → Vercel
```

---

## 🆘 트러블슈팅

### D1 마이그레이션 오류

**증상:** "duplicate column name" 오류지만 실제로는 적용됨

**해결:**
```bash
# 실제 스키마 확인
wrangler d1 execute oalum-orders "PRAGMA table_info(orders);" --remote

# 테이블 목록 확인
wrangler d1 execute oalum-orders "SELECT name FROM sqlite_master WHERE type='table';" --remote

# 문제가 있으면 재적용
wrangler d1 execute oalum-orders --file=cloudflare/d1/migrations/XXXX_*.sql --remote
```

### 배포 실패

**증상:** "pages-build-deployment" 실패

**확인:**
```bash
# 빌드 명령 테스트
npm run cf:build

# dist 디렉토리 확인
ls -la dist/

# 로그 확인
wrangler pages project view --name studiooalum
```

### 환경변수 적용 안 됨

**해결:**
```bash
# 1. Dashboard에서 수동 확인
# Cloudflare Pages → studiooalum → Settings → Environment variables

# 2. 배포 다시 트리거
npm run cf:pages:deploy

# 3. 캐시 무효화
# Cloudflare Dashboard → Caching → Purge Everything
```

---

## 📞 지원 정보

| 항목 | 연락처 | 시간 |
|------|--------|------|
| **Cloudflare 지원** | https://support.cloudflare.com | 24/7 |
| **Toss Payments** | dashboard.tosspayments.com/support | 업무시간 |
| **Sanity 지원** | community.sanity.io | 커뮤니티 |
| **GitHub** | github.com/support | 24/7 |

---

## 📌 마지막 점검

복원 후 반드시 확인할 사항:

```bash
# 1. API 엔드포인트
curl https://studiooalum.com/api/health

# 2. 정적 페이지
curl -I https://studiooalum.com/shop.html

# 3. 데이터베이스 연결
wrangler d1 execute oalum-orders "SELECT 1;" --remote

# 4. 환경변수
# Dashboard에서 모든 환경변수 확인

# 5. 도메인 SSL
openssl s_client -connect studiooalum.com:443 -servername studiooalum.com
```

---

**작성:** 2026-06-30  
**최종 검토:** [필요 시 업데이트]  
**버전:** 1.0
