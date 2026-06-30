# 📚 Studiooalum 문서 가이드

**마지막 업데이트:** 2026-06-30

이 디렉토리는 프로젝트의 모든 운영 및 개발 문서를 포함합니다.

---

## 🎯 어디서부터 시작할까?

### 🆕 처음 시작하는 사람

1. **[QUICK-REFERENCE.md](./QUICK-REFERENCE.md)** ← **여기서 시작!**
   - 빠른 참조 가이드
   - 필수 정보 요약
   - 복원 절차 (3단계)

2. [BACKUP-AND-MIGRATION-GUIDE.md](./BACKUP-AND-MIGRATION-GUIDE.md)
   - 상세 백업 및 마이그레이션 가이드
   - 전체 구성 요소 설명
   - 시나리오별 복원 절차

### 💼 운영/관리자

1. [ACCOUNT-INFO-TEMPLATE.md](./ACCOUNT-INFO-TEMPLATE.md)
   - 계정 정보 기록 템플릿
   - 접근 권한 관리
   - 비상 연락처

2. [ENVIRONMENT-SETUP-GUIDE.md](./ENVIRONMENT-SETUP-GUIDE.md)
   - 환경변수 설정 방법
   - 보안 모범 사례
   - 문제 해결

### 👨‍💻 개발자

1. [cloudflare-low-cost-stack.md](./cloudflare-low-cost-stack.md)
   - 아키텍처 개요
   - 비용 최적화 전략
   - Cloudflare 설정

2. [architecture.md](./architecture.md)
   - 저장소 구조 설명
   - 런타임 경계 정의
   - 마이그레이션 계획

### 🔧 특정 작업

| 작업 | 문서 |
|------|------|
| **배포** | [cloudflare-pages-transition.md](./cloudflare-pages-transition.md) |
| **도메인 설정** | [gabia-cloudflare-domain-setup.md](./gabia-cloudflare-domain-setup.md) |
| **주문 동기화** | [google-sheets-order-sync.md](./google-sheets-order-sync.md) |
| **Next.js 전환** | [apps-web-deploy.md](./apps-web-deploy.md) |
| **페이지 레이아웃** | [storefront-layout-rules.md](./storefront-layout-rules.md) |
| **Sanity 워크숍** | [workshop-sanity-studio-requirements.md](./workshop-sanity-studio-requirements.md) |

---

## 📖 전체 문서 목록

### 🆕 신규 (2026-06-30)

#### [QUICK-REFERENCE.md](./QUICK-REFERENCE.md)
- **용도:** 빠른 참조, 체크리스트
- **대상:** 모두
- **분량:** 5분 읽기
- **포함:**
  - 필수 정보 요약
  - 복원 절차 (3단계)
  - 배포 체크리스트
  - 자주 발생하는 문제

#### [BACKUP-AND-MIGRATION-GUIDE.md](./BACKUP-AND-MIGRATION-GUIDE.md)
- **용도:** 상세 가이드, 마이그레이션
- **대상:** 관리자, 개발자
- **분량:** 30분 읽기
- **포함:**
  - 인프라 정보 (Cloudflare, GitHub, 도메인)
  - 환경변수 상세 설명
  - D1 데이터베이스 마이그레이션
  - Cloudflare 설정 전체
  - 배포 파이프라인
  - 외부 서비스 통합 (Toss, Sanity, Google Sheets, Delivery Tracker)
  - 백업 체크리스트
  - 복원 절차 (3가지 시나리오)

#### [ACCOUNT-INFO-TEMPLATE.md](./ACCOUNT-INFO-TEMPLATE.md)
- **용도:** 계정 정보 기록
- **대상:** 관리자
- **분량:** 기록용 템플릿
- **포함:**
  - Cloudflare 계정 정보
  - Toss 결제 키
  - GitHub 저장소 정보
  - 도메인 설정
  - 환경변수 값 (임시 기록용)
  - 데이터 백업 위치
  - 2FA 복구 코드
  - 변경 이력

#### [ENVIRONMENT-SETUP-GUIDE.md](./ENVIRONMENT-SETUP-GUIDE.md)
- **용도:** 환경변수 설정 및 보안
- **대상:** 개발자, 관리자
- **분량:** 20분 읽기
- **포함:**
  - 환경변수 개요
  - 로컬 개발 설정
  - Cloudflare Pages 설정
  - 특별한 경우의 설정
  - 보안 모범 사례
  - 문제 해결

### 기존 문서

#### [cloudflare-low-cost-stack.md](./cloudflare-low-cost-stack.md)
- **용도:** 아키텍처 설명
- **포함:**
  - Pages + Workers + D1 스택 설명
  - 비용 예측
  - 최소 API 요구사항
  - D1 테이블 구조

#### [architecture.md](./architecture.md)
- **용도:** 저장소 구조 및 마이그레이션 계획
- **포함:**
  - 런타임 경계 정의
  - Storefront 레이아웃 규칙
  - Full App vs Low-Cost 방향
  - 마이그레이션 순서

#### [cloudflare-pages-transition.md](./cloudflare-pages-transition.md)
- **용도:** GitHub Pages → Cloudflare Pages 전환
- **포함:**
  - 단계별 전환 가이드
  - Wrangler 설정
  - 배포 검증

#### [gabia-cloudflare-domain-setup.md](./gabia-cloudflare-domain-setup.md)
- **용도:** 도메인 연결
- **포함:**
  - Gabia 도메인 설정
  - Cloudflare DNS 연결
  - SSL/TLS 설정

#### [google-sheets-order-sync.md](./google-sheets-order-sync.md)
- **용도:** 주문 동기화 설정
- **포함:**
  - Google Sheets 템플릿
  - Apps Script 코드
  - Webhook 설정

#### [apps-web-deploy.md](./apps-web-deploy.md)
- **용도:** Next.js 앱 배포
- **포함:**
  - Vercel 전환 체크리스트
  - 환경변수
  - 마이그레이션 단계

#### [storefront-layout-rules.md](./storefront-layout-rules.md)
- **용도:** 페이지 레이아웃 규칙
- **포함:**
  - 3열 좌표계
  - CSS 클래스
  - 반응형 설정

#### [workshop-sanity-studio-requirements.md](./workshop-sanity-studio-requirements.md)
- **용도:** Sanity Studio 워크숍 요구사항
- **포함:**
  - Studio 설정
  - 스키마 정의
  - 배포

#### [commerce-schema.sql](./commerce-schema.sql)
- **용도:** Postgres 스키마 (미래용)
- **포함:**
  - 주문, 결제, 배송 테이블
  - 인덱스 정의

#### [seo-optimization-plan.md](./seo-optimization-plan.md)
- **용도:** SEO 최적화
- **포함:**
  - 메타태그 설정
  - Sitemap
  - 캐시 전략

#### [cloudflare-traffic-hygiene.md](./cloudflare-traffic-hygiene.md)
- **용도:** 트래픽 보안 및 모니터링
- **포함:**
  - Rate limiting
  - DDoS 방어
  - 접근 제어

---

## 📊 문서별 읽기 시간 및 대상

```
분류 별로:

신규 (꼭 읽어야 함):
  ├─ QUICK-REFERENCE.md (5분) ⭐⭐⭐⭐⭐
  ├─ BACKUP-AND-MIGRATION-GUIDE.md (30분) ⭐⭐⭐⭐⭐
  ├─ ACCOUNT-INFO-TEMPLATE.md (기록용) ⭐⭐⭐⭐
  └─ ENVIRONMENT-SETUP-GUIDE.md (20분) ⭐⭐⭐⭐

핵심 (프로젝트 이해):
  ├─ cloudflare-low-cost-stack.md (15분) ⭐⭐⭐⭐
  ├─ architecture.md (20분) ⭐⭐⭐⭐
  └─ apps-web-deploy.md (15분) ⭐⭐⭐

설정 (특정 작업):
  ├─ gabia-cloudflare-domain-setup.md (10분) ⭐⭐⭐
  ├─ google-sheets-order-sync.md (15분) ⭐⭐⭐
  ├─ cloudflare-pages-transition.md (15분) ⭐⭐⭐
  └─ storefront-layout-rules.md (10분) ⭐⭐

기타:
  ├─ commerce-schema.sql (참고용) ⭐⭐
  ├─ seo-optimization-plan.md (10분) ⭐⭐
  ├─ cloudflare-traffic-hygiene.md (10분) ⭐⭐
  └─ workshop-sanity-studio-requirements.md (10분) ⭐⭐
```

---

## 🎯 상황별 읽기 가이드

### 상황 1: "프로젝트를 새 환경에서 복원하고 싶어"
1. QUICK-REFERENCE.md (필수)
2. BACKUP-AND-MIGRATION-GUIDE.md (상세 정보)
3. ENVIRONMENT-SETUP-GUIDE.md (설정)

### 상황 2: "로컬 개발 환경을 세팅하고 싶어"
1. QUICK-REFERENCE.md (빠른 시작)
2. ENVIRONMENT-SETUP-GUIDE.md (로컬 설정)
3. cloudflare-low-cost-stack.md (구조 이해)

### 상황 3: "팀원에게 인수인계하고 싶어"
1. ACCOUNT-INFO-TEMPLATE.md (정보 기록)
2. BACKUP-AND-MIGRATION-GUIDE.md (전체 이해)
3. cloudflare-low-cost-stack.md (아키텍처)

### 상황 4: "특정 서비스를 설정하고 싶어"
| 서비스 | 문서 |
|--------|------|
| 도메인 | gabia-cloudflare-domain-setup.md |
| 주문 동기화 | google-sheets-order-sync.md |
| Next.js 배포 | apps-web-deploy.md |
| 페이지 레이아웃 | storefront-layout-rules.md |
| SEO | seo-optimization-plan.md |

### 상황 5: "긴급 상황에서 빠르게 조치하고 싶어"
1. QUICK-REFERENCE.md (체크리스트)
2. ENVIRONMENT-SETUP-GUIDE.md (문제 해결)
3. BACKUP-AND-MIGRATION-GUIDE.md (트러블슈팅)

---

## 📌 중요 정보 위치

### 계정 & 인증 정보
```
➜ ACCOUNT-INFO-TEMPLATE.md (암호화 저장)
  ├─ Cloudflare Account ID
  ├─ API Token
  ├─ Toss 결제 키
  ├─ GitHub 토큰
  └─ 도메인 정보
```

### 환경변수 설정
```
➜ ENVIRONMENT-SETUP-GUIDE.md (실행 가이드)
  ├─ 로컬 개발 설정 (.env.local)
  ├─ Cloudflare Pages 설정
  └─ 보안 모범 사례

➜ BACKUP-AND-MIGRATION-GUIDE.md (참고 정보)
  └─ 각 변수 상세 설명
```

### 데이터베이스
```
➜ BACKUP-AND-MIGRATION-GUIDE.md
  ├─ D1 스키마 설명
  ├─ 마이그레이션 절차
  └─ 복원 방법

➜ cloudflare/d1/ (실제 파일)
  ├─ schema.sql
  └─ migrations/
```

### 배포 및 런타임
```
➜ BACKUP-AND-MIGRATION-GUIDE.md
  ├─ Pages 프로젝트 설정
  ├─ 배포 파이프라인
  └─ 배포 체크리스트

➜ cloudflare-pages-transition.md
  └─ Pages 전환 절차

➜ cloudflare-low-cost-stack.md
  └─ 아키텍처 개요
```

---

## ✅ 체크리스트

### 프로젝트 인계 전
```
☐ ACCOUNT-INFO-TEMPLATE.md 작성 및 암호화
☐ BACKUP-AND-MIGRATION-GUIDE.md 검토
☐ D1 백업 확인
☐ 환경변수 설정 확인
☐ 도메인 설정 확인
☐ 2FA 복구 코드 안전 보관
```

### 신규 팀원 온보딩
```
☐ QUICK-REFERENCE.md 읽기
☐ cloudflare-low-cost-stack.md 읽기
☐ architecture.md 읽기
☐ 로컬 개발 환경 구성
☐ ENVIRONMENT-SETUP-GUIDE.md 참고하며 .env.local 작성
☐ npm run cf:pages:dev 실행 및 테스트
```

### 정기 유지보수
```
월 1회:
  ☐ D1 백업 실시
  ☐ 배포 로그 검토

분기별:
  ☐ 이 README 검토
  ☐ 문서 최신화 필요 여부 확인
  ☐ ACCOUNT-INFO-TEMPLATE.md 검증

반기별:
  ☐ 전체 문서 검토
  ☐ 아키텍처 변경사항 반영
```

---

## 🔗 관련 외부 문서

| 서비스 | 공식 문서 |
|--------|---------|
| Cloudflare | https://developers.cloudflare.com |
| D1 | https://developers.cloudflare.com/d1 |
| Pages | https://developers.cloudflare.com/pages |
| Toss Payments | https://docs.tosspayments.com |
| Sanity | https://www.sanity.io/docs |
| Next.js | https://nextjs.org/docs |
| GitHub Pages | https://pages.github.com |

---

## 📝 문서 작성 가이드

새 문서를 추가할 때:

1. **이 README에 항목 추가**
2. **파일명 규칙:** `kebab-case-description.md`
3. **구조:**
   ```markdown
   # 제목
   **목적:** 
   **대상:** 
   **분량:** 
   
   ---
   
   [내용]
   ```
4. **민감 정보:** 절대 포함 금지 (계정번호, API 키 등)

---

## 💾 백업

모든 문서는 다음에 포함되어 백업됩니다:

```bash
# 수동 백업
tar czf backup-docs-$(date +%Y%m%d).tar.gz docs/

# Git 자동 백업
git push origin main
```

---

## 📞 문의

각 문서의 문제나 오류는 해당 문서 하단의 연락처를 참고하세요.

---

**마지막 업데이트:** 2026-06-30  
**담당:** Studiooalum 개발팀  
**상태:** ✅ 활성 (정기 검토 중)
