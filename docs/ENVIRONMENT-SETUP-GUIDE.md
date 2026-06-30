# 환경변수 설정 및 보안 가이드

**업데이트:** 2026-06-30  
**목적:** 환경변수 안전 관리 및 설정 자동화

---

## 목차

1. [환경변수 개요](#환경변수-개요)
2. [설정 방법](#설정-방법)
3. [보안 모범 사례](#보안-모범-사례)
4. [문제 해결](#문제-해결)

---

## 환경변수 개요

### 구분

프로젝트는 다음 3가지 환경에서 실행됩니다:

| 환경 | 위치 | 접근 | 용도 |
|------|------|------|------|
| **로컬 개발** | `.env.local` | 개발자 | 로컬 테스트 |
| **Cloudflare 미리보기** | Pages Dashboard | 개발팀 | 프리뷰 배포 |
| **프로덕션** | Pages Dashboard | 관리자만 | 라이브 서비스 |

### 변수 분류

```
🔴 극비 (절대 공개 금지)
  ├── TOSS_SECRET_KEY
  ├── ORDER_ADMIN_SECRET
  ├── DELIVERY_TRACKER_CLIENT_SECRET
  ├── ORDER_SYNC_SHARED_SECRET
  └── API 토큰들

🟠 민감정보 (보안 주의)
  ├── DELIVERY_TRACKER_CLIENT_ID
  ├── ORDER_SYNC_WEBHOOK_URL
  ├── CLOUDFLARE_WEB_ANALYTICS_TOKEN
  └── 웹훅 URL들

🟢 공개 가능 (Git 저장소 OK)
  ├── NEXT_PUBLIC_TOSS_CLIENT_KEY (테스트용만)
  ├── NEXT_PUBLIC_SANITY_PROJECT_ID
  ├── NEXT_PUBLIC_SANITY_DATASET
  └── NEXT_PUBLIC_* 로 시작하는 모든 변수
```

---

## 설정 방법

### 1. 로컬 개발 환경 설정

#### Step 1: .env.local 파일 생성

```bash
cd /workspaces/studiooalum.github.io
cat > .env.local << 'EOF'
# 테스트 환경 결제
AUTH_COOKIE_INSECURE=true
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_test_[테스트 키]
TOSS_SECRET_KEY=sk_test_[테스트 시크릿]

# CMS (공개 프로젝트)
NEXT_PUBLIC_SANITY_PROJECT_ID=9bsud0bl
NEXT_PUBLIC_SANITY_DATASET=production

# 로컬 인증
ORDER_ADMIN_SECRET=local_dev_test_secret
OALUM_STRICT_PERSISTENCE=false

# 선택사항: 배송 추적 (테스트)
# DELIVERY_TRACKER_CLIENT_ID=test_id
# DELIVERY_TRACKER_CLIENT_SECRET=test_secret
EOF
```

#### Step 2: .gitignore 확인

```bash
# .gitignore 파일에 아래가 있는지 확인
cat .gitignore | grep "\.env"
```

출력 확인:
```
/.env
.env.local
.env.*.local
```

없으면 추가:
```bash
echo ".env.local" >> .gitignore
```

#### Step 3: 로컬 테스트

```bash
# .env.local이 로드되는지 확인
npm run cf:pages:dev

# 브라우저에서 확인
curl http://localhost:8788/api/health

# 응답 예시:
# {"ok":true,"service":"studiooalum-pages-functions",...}
```

### 2. Cloudflare Pages 환경변수 설정

#### Step 1: 대시보드 접근

```
https://dash.cloudflare.com/
→ Pages
→ studiooalum
→ Settings
→ Environment variables
```

#### Step 2: 프로덕션 배포용 변수 추가

**작업 1: 결제 설정**

```
Variable Name: NEXT_PUBLIC_TOSS_CLIENT_KEY
Value: pk_live_[실결제 클라이언트 키]
Environments: Production

Variable Name: TOSS_SECRET_KEY
Value: sk_live_[실결제 시크릿 키]
Environments: Production
```

**작업 2: CMS 설정**

```
Variable Name: NEXT_PUBLIC_SANITY_PROJECT_ID
Value: 9bsud0bl
Environments: Production + Preview

Variable Name: NEXT_PUBLIC_SANITY_DATASET
Value: production
Environments: Production + Preview
```

**작업 3: 인증 & 보안**

```
Variable Name: ORDER_ADMIN_SECRET
Value: [보안 토큰]
Environments: Production

Variable Name: ORDER_SYNC_SHARED_SECRET
Value: [Google Apps Script 공유 비밀]
Environments: Production
(선택사항)
```

#### Step 3: 미리보기 배포용 변수 추가 (선택사항)

```
Variable Name: NEXT_PUBLIC_TOSS_CLIENT_KEY
Value: pk_test_[테스트 클라이언트 키]
Environments: Preview

Variable Name: TOSS_SECRET_KEY
Value: sk_test_[테스트 시크릿 키]
Environments: Preview
```

#### Step 4: 변수 확인

```bash
# CLI에서 확인
wrangler pages project view --name studiooalum

# 또는 Dashboard에서:
# Settings → Environment variables → 모든 변수 목록 확인
```

### 3. 특별한 경우의 설정

#### 배송 추적 (Delivery Tracker) 추가

```
1. Dashboard → Pages → studiooalum → Settings → Environment variables

Variable Name: DELIVERY_TRACKER_CLIENT_ID
Value: [Tracker.delivery에서 발급받은 ID]
Environments: Production

Variable Name: DELIVERY_TRACKER_CLIENT_SECRET
Value: [비밀 키]
Environments: Production

Variable Name: DELIVERY_TRACKER_WEBHOOK_SECRET
Value: [웹훅 인증용 비밀]
Environments: Production
(선택사항)

2. 완료 후 배포:
npm run cf:pages:deploy
```

#### 주문 동기화 (Google Sheets) 추가

```
1. Dashboard → Pages → studiooalum → Settings → Environment variables

Variable Name: ORDER_SYNC_WEBHOOK_URL
Value: https://script.google.com/macros/d/[프로젝트ID]/userweb
Environments: Production

Variable Name: ORDER_SYNC_SHARED_SECRET
Value: [Apps Script에서 생성한 비밀]
Environments: Production

Variable Name: ORDER_NOTIFICATION_EMAILS
Value: orders@studiooalum.com,admin@studiooalum.com
Environments: Production

2. Google Apps Script 웹훅 설정 완료 후:
npm run cf:pages:deploy
```

---

## 보안 모범 사례

### 1. 접근 제어

#### Cloudflare 계정 권한 설정

```
Dashboard → Account Home → Members

권한 레벨:

관리자 (1명 - 소유자):
  ├── Pages 완전 관리
  ├── Worker 완전 관리
  ├── D1 완전 관리
  ├── 계정 설정 관리
  └── 환경변수 설정 권한

개발자 (팀원, 선택적):
  ├── Pages 배포 권한
  ├── D1 읽기 권한
  └── Worker 배포 권한
```

#### GitHub 저장소 권한

```
Settings → Access → Collaborators

- 소유자: 모든 권한
- 개발자: Push 권한 (Settings 제외)
- 검토자: Pull Request 리뷰 권한
```

### 2. 비밀 키 관리

#### API 토큰 주기적 갱신

```bash
# 분기별 (3개월) 실시:

1. Cloudflare 새 토큰 생성
   Dashboard → My Profile → API Tokens → Create Token

2. 로컬에서 테스트
   export CLOUDFLARE_API_TOKEN="new_token"
   wrangler whoami

3. 기존 토큰 삭제
   Dashboard → My Profile → API Tokens → Delete

4. 변경 이력 기록
   docs/ACCOUNT-INFO-TEMPLATE.md 업데이트
```

#### Toss 키 관리

```bash
# 반기별 (6개월) 갱신:

1. Toss Dashboard → Settings → API Keys
   → Regenerate

2. 로컬 .env.local 업데이트 (테스트용)

3. Cloudflare Dashboard → Pages → Settings → Environment variables
   → TOSS_SECRET_KEY 업데이트

4. 배포 후 테스트
   npm run cf:pages:deploy
   curl https://studiooalum.com/api/health
```

### 3. 2단계 인증 (2FA)

#### 모든 계정에 2FA 활성화

```
☐ Cloudflare: Dashboard → My Profile → Authentication
  └── Authenticator App 또는 Backup Codes 설정

☐ GitHub: Settings → Password and authentication → Two-factor authentication
  └── Authenticator App 필수

☐ Toss Payments: Dashboard → Settings → Security
  └── 2FA 또는 OTP 설정

☐ Google (Sheets): myaccount.google.com → Security
  └── Authenticator App 설정
```

**복구 코드 보관:**
```
1. 각 서비스의 복구 코드 출력
2. 암호화된 저장소에 보관 (1Password, LastPass 등)
3. 물리적 백업: 보안함에 보관

⚠️ 절대 깃 저장소나 클라우드 드라이브에 저장 금지
```

### 4. 네트워크 보안

#### 요청 인증 검증

```javascript
// cloudflare/lib/order-sync.js 예시

async function verifyWebhookSignature(request, secret) {
  const signature = request.headers.get("x-webhook-signature");
  const body = await request.text();
  
  // HMAC-SHA256 검증
  const expected = await signPayload(secret, body);
  
  return signature === expected;
}
```

#### Rate Limiting 설정

```
Cloudflare Dashboard → Page Rules

URL: /api/orders
  ├── Rate Limiting: 10 requests per 10 seconds
  └── Action: Challenge (차단)

URL: /api/payments/confirm
  ├── Rate Limiting: 5 requests per minute
  └── Action: Block
```

### 5. 감시 및 로깅

#### 배포 로그 모니터링

```bash
# 최근 배포 확인
wrangler pages deployments list --name studiooalum

# 배포 로그 실시간 모니터링
wrangler pages deployment tail --name studiooalum

# 에러 필터링
wrangler pages deployment tail --name studiooalum | grep -i error
```

#### Cloudflare Analytics 활성화

```
Dashboard → Pages → studiooalum → Analytics

모니터링 항목:
  ├── Request 수
  ├── 응답 시간
  ├── 에러율
  ├── 지역별 트래픽
  └── 웹 바이탈 (Core Web Vitals)
```

---

## 문제 해결

### 환경변수가 로드되지 않음

**증상:** API 응답에 "env variable not found"

**해결:**

```bash
# 1. 변수 명확히 확인
wrangler pages project view --name studiooalum | grep "VARIABLE_NAME"

# 2. 타이핑 오류 확인
# 변수명은 대소문자 민감함

# 3. 배포 다시 수행
npm run cf:pages:deploy

# 4. 캐시 무효화
# Cloudflare Dashboard → Caching → Purge Everything

# 5. 브라우저 캐시 무효화
# Ctrl+Shift+Del (새 탭에서 재방문)
```

### 테스트 환경 키로 실결제 발생

**증상:** 결제 후 실제 금액 차감됨

**즉시 조치:**

```
1. 긴급 전화
   Toss 고객 지원: 1577-9900

2. 거래 취소 요청
   - 주문 ID
   - 거래 일시
   - 결제 금액

3. 환경변수 재검토
   Cloudflare Dashboard → Pages → Settings → Environment variables
   → TOSS_SECRET_KEY 확인
```

**예방:**

```bash
# 배포 전 항상 환경 확인
npm run cf:pages:deploy

# 로그에서 키 유형 확인
wrangler pages deployment tail --name studiooalum

# 실결제는 승인 전 수동 테스트만 수행
```

### 로컬 개발에서 D1 바인딩 오류

**증상:** "D1 binding is required for auth"

**해결:**

```bash
# 1. wrangler 최신 버전 확인
npm list wrangler

# 2. 로컬 D1 초기화
wrangler d1 create oalum-orders --local

# 3. 스키마 적용
wrangler d1 execute oalum-orders --file=cloudflare/d1/schema.sql --local

# 4. 다시 시작
npm run cf:pages:dev
```

### 변수 값이 노출됨

**발생했을 경우:**

```
1. 즉시 해당 키 재발급
   - Cloudflare: My Profile → API Tokens → Delete
   - Toss: Dashboard → Settings → API Keys → Regenerate
   - GitHub: Settings → Developer settings → Personal access tokens → Delete

2. 새 키로 환경변수 업데이트
   Cloudflare Dashboard → Pages → Settings → Environment variables

3. 배포
   npm run cf:pages:deploy

4. 감사 로그 검토
   Cloudflare Dashboard → Audit Log
   GitHub Repository → Settings → Audit log
```

---

## 체크리스트

### 초기 설정

```
☐ .env.local 파일 생성
☐ .gitignore에 .env.local 포함
☐ Cloudflare Pages 환경변수 설정 (프로덕션)
☐ Cloudflare Pages 환경변수 설정 (미리보기)
☐ 로컬 테스트: npm run cf:pages:dev
☐ API 엔드포인트 테스트: curl http://localhost:8788/api/health
☐ 배포 테스트: npm run cf:pages:deploy
☐ 라이브 확인: curl https://studiooalum.com/api/health
```

### 월별 점검

```
☐ 환경변수 값 정확성 확인
☐ 배포 로그 검토 (에러 없는지)
☐ D1 백업 실시
☐ 접근 로그 검토
```

### 분기별 점검

```
☐ API 토큰 갱신 필요 여부 검토
☐ 계정 권한 재검토
☐ 2FA 복구 코드 유효성 확인
☐ 외부 서비스 연결 상태 검증
```

---

**마지막 검토:** 2026-06-30
