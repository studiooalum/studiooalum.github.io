# 빠른 참조 - 백업 및 마이그레이션 체크리스트

**최종 업데이트:** 2026-06-30  
**용도:** 프로젝트 복원 시 필요한 정보 빠른 확인

---

## 🔴 긴급: 수집 필요한 정보

현재 상태 기준, 아래 정보를 **반드시 수집하고 암호화 저장소에 보관**하세요.

### 1단계: 계정 정보 기록

```
필수 정보 (복사하여 ACCOUNT-INFO-TEMPLATE.md에 기록):

Cloudflare:
  - Account ID: ________________________________
  - API Token: ________________________________ ⚠️ 비밀

Toss Payments:
  - pk_live_***: ________________________________ 🟢 공개 가능
  - sk_live_***: ________________________________ 🔴 극비

GitHub:
  - Repository: studiooalum/studiooalum.github.io
  - Personal Access Token: ______________________ 🔴 극비

Domain:
  - Domain: studiooalum.com
  - Registrar: Gabia
```

**저장소:**
- ✅ 1Password / LastPass (권장)
- ✅ 암호화된 USB (백업)
- ✅ 별도 암호화 파일 (암호 설정 필수)
- ❌ Git 저장소 (절대 금지!)
- ❌ 일반 텍스트 파일 (절대 금지!)

### 2단계: 자동화 스크립트 실행

```bash
# 현재 설정 백업
bash scripts/backup-cloudflare-config.sh    # 아래 참고

# D1 데이터 백업
wrangler d1 export oalum-orders > \
  backup-d1-$(date +%Y%m%d).sql --remote
```

### 3단계: 정기 백업 일정 설정

```
월 1회:   자동 D1 백업
분기별:   설정 파일 검토
반기별:   Toss 키 갱신
분기별:   API 토큰 갱신
```

---

## 📋 필수 정보 요약

### Cloudflare Pages 설정

| 항목 | 값 | 저장소 |
|------|----|----|
| 프로젝트명 | `studiooalum` | 공개 |
| GitHub Repo | `studiooalum/studiooalum.github.io` | 공개 |
| 빌드 명령 | `npm run cf:build` | 공개 |
| 출력 디렉토리 | `./dist` | 공개 |
| D1 Database | `oalum-orders` (ID: 3dcf3c2e...) | 반공개 |
| Account ID | `[수집 필수]` | 🔴 극비 |

### 환경변수 (프로덕션)

| 변수명 | 예시 값 | 분류 | 저장소 |
|--------|--------|------|--------|
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | `pk_live_...` | 공개 | Git OK |
| `TOSS_SECRET_KEY` | `sk_live_...` | 🔴 극비 | Cloudflare Only |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | `9bsud0bl` | 공개 | Git OK |
| `ORDER_ADMIN_SECRET` | `[비밀]` | 🔴 극비 | Cloudflare Only |
| `ORDER_SYNC_WEBHOOK_URL` | `https://script.google.com/...` | 🟠 민감 | Cloudflare Only |

### 도메인 설정

| 항목 | 값 |
|------|-----|
| 도메인 | `studiooalum.com` |
| 등록처 | Gabia |
| 네임서버 | Cloudflare NS |
| GitHub Pages | `studiooalum.github.io` |
| Cloudflare Pages | `studiooalum.pages.dev` |
| SSL/TLS | Full (strict) |

---

## 🚀 복원 절차 (3단계)

### 단계 1: 기본 설정 (1시간)

```bash
# 1. 저장소 클론
git clone https://github.com/studiooalum/studiooalum.github.io.git
cd studiooalum.github.io

# 2. 패키지 설치
npm install

# 3. Wrangler 인증
export CLOUDFLARE_API_TOKEN="[토큰]"
wrangler whoami

# 4. 로컬 환경 설정
cat > .env.local << 'EOF'
AUTH_COOKIE_INSECURE=true
NEXT_PUBLIC_TOSS_CLIENT_KEY=pk_test_[테스트 키]
TOSS_SECRET_KEY=sk_test_[테스트 시크릿]
NEXT_PUBLIC_SANITY_PROJECT_ID=9bsud0bl
NEXT_PUBLIC_SANITY_DATASET=production
ORDER_ADMIN_SECRET=[로컬용]
EOF

# 5. 로컬 테스트
npm run cf:pages:dev
curl http://localhost:8788/api/health
```

### 단계 2: 데이터베이스 복원 (30분)

```bash
# 1. D1 데이터베이스 생성 (새 계정인 경우)
wrangler d1 create oalum-orders

# 2. 스키마 적용
wrangler d1 execute oalum-orders \
  --file=cloudflare/d1/schema.sql --remote

# 3. 마이그레이션 적용
for file in cloudflare/d1/migrations/*.sql; do
  echo "Applying $file..."
  wrangler d1 execute oalum-orders --file=$file --remote
done

# 4. 검증
wrangler d1 execute oalum-orders \
  "SELECT name FROM sqlite_master WHERE type='table';" --remote
```

### 단계 3: Cloudflare 배포 (1시간)

```bash
# 1. Pages 프로젝트 생성
# Dashboard → Pages → Create Project → GitHub 연결
# 또는 CLI:
# wrangler pages project create

# 2. 환경변수 설정 (Dashboard)
# Settings → Environment variables
# [ACCOUNT-INFO-TEMPLATE.md 참고]

# 3. D1 바인딩 추가 (Dashboard)
# Functions → D1 Database Bindings
# Variable: OALUM_DB → Database: oalum-orders

# 4. 도메인 연결
# Custom Domain: studiooalum.com

# 5. 배포
npm run cf:pages:deploy

# 6. 확인
curl https://studiooalum.com/api/health
```

---

## ✅ 배포 전 체크리스트

```
☐ 로컬 빌드 성공
  npm run cf:build

☐ 로컬 테스트 성공
  npm run cf:pages:dev
  curl http://localhost:8788/api/health

☐ 환경변수 설정 (Cloudflare)
  - Toss 키 확인 (실결제 또는 테스트 구분)
  - ORDER_ADMIN_SECRET 설정
  - ORDER_SYNC 설정 (선택)

☐ D1 바인딩 설정
  - OALUM_DB 연결 확인
  - 스키마 적용 확인

☐ 도메인 설정
  - DNS CNAME 설정
  - SSL 활성화
  - HTTPS 강제 설정

☐ 배포 수행
  npm run cf:pages:deploy

☐ 라이브 확인
  curl https://studiooalum.com/api/health
  curl -I https://studiooalum.com/shop.html
```

---

## 🆘 자주 발생하는 문제

### 문제 1: 환경변수가 로드되지 않음

```bash
# 해결
1. Dashboard에서 변수 확인
   Pages → studiooalum → Settings → Environment variables

2. 배포 다시 수행
   npm run cf:pages:deploy

3. 캐시 무효화
   Dashboard → Caching → Purge Everything

4. 확인
   curl https://studiooalum.com/api/health
```

### 문제 2: 테스트 결제로 실제 금액 차감

```bash
# 긴급 조치
1. 즉시 전화: Toss 고객 지원 1577-9900
2. 환경변수 재확인: sk_test_ vs sk_live_
3. 키 비상 재발급 (Dashboard)
4. Pages 재배포
```

### 문제 3: D1 스키마 오류

```bash
# 해결
1. 실제 스키마 확인
   wrangler d1 execute oalum-orders \
     "PRAGMA table_info(orders);" --remote

2. 테이블 목록 확인
   wrangler d1 execute oalum-orders \
     "SELECT name FROM sqlite_master WHERE type='table';" --remote

3. 필요시 마이그레이션 재적용
```

---

## 📞 필요한 계정 & 접근

| 서비스 | URL | 계정 | 2FA |
|--------|-----|------|-----|
| **Cloudflare** | https://dash.cloudflare.com | ☐ 필수 | ☐ 필수 |
| **Toss** | https://dashboard.tosspayments.com | ☐ 필수 | ☐ 권장 |
| **GitHub** | https://github.com | ☐ 필수 | ☐ 필수 |
| **Sanity** | https://sanity.io | ☐ 필수 | ☐ 권장 |
| **Domain (Gabia)** | https://www.gabia.com | ☐ 필수 | ☐ 권장 |

---

## 📁 중요 파일 위치

```
프로젝트 루트
├── docs/
│   ├── BACKUP-AND-MIGRATION-GUIDE.md      ← 상세 가이드
│   ├── ACCOUNT-INFO-TEMPLATE.md           ← 계정 정보 기록
│   ├── ENVIRONMENT-SETUP-GUIDE.md         ← 환경변수 설정
│   └── cloudflare-low-cost-stack.md       ← 아키텍처
├── cloudflare/
│   ├── d1/
│   │   ├── schema.sql                     ← D1 스키마
│   │   └── migrations/                    ← 마이그레이션
│   └── lib/                               ← Workers 라이브러리
├── functions/
│   └── api/                               ← API 엔드포인트
├── wrangler.jsonc                         ← Cloudflare 설정
├── _routes.json                           ← 라우팅 규칙
├── _headers                               ← HTTP 헤더
└── _redirects                             ← URL 리다이렉트
```

---

## 🔐 보안 체크

```
초기 설정 후:

☐ Cloudflare 2FA 활성화
☐ GitHub 2FA 활성화  
☐ Toss 2FA 활성화
☐ 2FA 복구 코드 안전 보관
☐ .env.local을 .gitignore에 추가
☐ API 토큰 저장소 확보 (1Password 등)
☐ 팀원 권한 설정
☐ 감시 로그 활성화
```

---

## 📅 정기 점검 일정

```
매월 1일:
  - D1 백업 확인
  - 배포 로그 검토

매 분기 초 (1월, 4월, 7월, 10월):
  - API 토큰 갱신 여부 검토
  - 계정 권한 재검토
  - 2FA 설정 확인

매 반기 초 (1월, 7월):
  - Toss 키 갱신 검토
  - 외부 서비스 연결 상태 확인
  - 보안 감사
```

---

## 📞 도움말

자세한 정보는 다음 문서를 참고하세요:

- **전체 가이드**: [BACKUP-AND-MIGRATION-GUIDE.md](./BACKUP-AND-MIGRATION-GUIDE.md)
- **계정 정보**: [ACCOUNT-INFO-TEMPLATE.md](./ACCOUNT-INFO-TEMPLATE.md)
- **환경변수**: [ENVIRONMENT-SETUP-GUIDE.md](./ENVIRONMENT-SETUP-GUIDE.md)
- **아키텍처**: [cloudflare-low-cost-stack.md](./cloudflare-low-cost-stack.md)

---

**최종 확인 날짜:** ________________  
**담당자:** ________________  
**연락처:** ________________
