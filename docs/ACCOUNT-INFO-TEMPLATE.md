# Studiooalum 계정 정보 기록 템플릿

**⚠️ 주의:** 이 파일은 `.gitignore`에 포함되어야 하며, 암호화된 저장소에만 보관하세요.  
**권장:** 1Password, LastPass 또는 별도의 암호화 도구 사용

---

## Cloudflare 계정

```
Account Name: _________________________________
Account ID: _________________________________
Email: _________________________________
Signup Date: _________________________________
Billing Contact: _________________________________

API Token (Wrangler용):
  생성일: _________________________________
  토큰: _________________________________
  권한 범위: Pages, Workers, D1, Accounts Read
  만료: _________________________________

주의: 토큰은 절대 버전 관리에 포함하지 마세요!
```

## Cloudflare Pages 프로젝트

```
Project Name: studiooalum
Project ID: _________________________________
GitHub Repository: studiooalum/studiooalum.github.io
GitHub Token: _________________________________

Production Domain: studiooalum.com
Deployment URL: https://studiooalum.pages.dev
Preview URL: https://[deployment-hash].pages.dev

D1 Binding:
  Binding Name: OALUM_DB
  Database Name: oalum-orders
  Database ID: 3dcf3c2e-9176-471c-8da2-ffca1dc2e9cb
```

## D1 데이터베이스

```
Database Name: oalum-orders
Database ID: _________________________________
Created: _________________________________
Storage Used: _________________________________
Last Backed Up: _________________________________

Backup Location 1: _________________________________
Backup Location 2: _________________________________
Backup Encryption Key: _________________________________

마이그레이션 적용 상태:
  ☐ 0001_schema.sql (기본 스키마)
  ☐ 0002_auth_oauth.sql (OAuth)
  ☐ 0003_password_auth.sql (비밀번호 인증)
  ☐ 0003_workshop_reservations.sql (워크숍)
  ☐ 0004_shipments.sql (배송)
  ☐ 0005_loyalty_points.sql (포인트)
  ☐ 0006_coupons.sql (쿠폰)
```

## Toss Payments

```
비즈니스 회원 정보:
  이름: _________________________________
  사업자번호: _________________________________
  휴대폰: _________________________________
  계정 상태: _________________________________

Toss 대시보드 로그인:
  이메일: _________________________________
  2FA 설정: ☐ Yes ☐ No (설정 필수!)

API 키:

테스트 환경:
  Client Key: pk_test_________________________________
  Secret Key: sk_test_________________________________
  생성일: _________________________________
  마지막 사용: _________________________________

실결제 환경:
  Client Key: pk_live_________________________________
  Secret Key: sk_live_________________________________
  생성일: _________________________________
  마지막 재발급: _________________________________

Webhook URL: https://studiooalum.com/api/webhooks/toss
Webhook Secret: _________________________________
```

## 환경변수 - 프로덕션

```
NEXT_PUBLIC_TOSS_CLIENT_KEY: pk_live_________________________________
TOSS_SECRET_KEY: sk_live_________________________________
NEXT_PUBLIC_SANITY_PROJECT_ID: 9bsud0bl
NEXT_PUBLIC_SANITY_DATASET: production
ORDER_ADMIN_SECRET: _________________________________
CLOUDFLARE_WEB_ANALYTICS_TOKEN: _________________________________

선택사항:
ORDER_SYNC_WEBHOOK_URL: _________________________________
ORDER_SYNC_SHARED_SECRET: _________________________________
ORDER_NOTIFICATION_EMAILS: _________________________________

DELIVERY_TRACKER_CLIENT_ID: _________________________________
DELIVERY_TRACKER_CLIENT_SECRET: _________________________________
DELIVERY_TRACKER_WEBHOOK_SECRET: _________________________________
```

## 환경변수 - 개발/테스트

```
AUTH_COOKIE_INSECURE: true
NEXT_PUBLIC_TOSS_CLIENT_KEY: pk_test_________________________________
TOSS_SECRET_KEY: sk_test_________________________________
ORDER_ADMIN_SECRET: [로컬 테스트용]
OALUM_STRICT_PERSISTENCE: false
```

## Sanity CMS

```
Project ID: 9bsud0bl
Organization: _________________________________
프로젝트 URL: https://sanity.io/manage/projects/9bsud0bl

Dataset:
  이름: production
  접근 레벨: Public (토큰 불필요)
  API Version: 2023-01-01

API 토큰 (필요 시):
  읽기전용 토큰: _________________________________
  쓰기 권한 토큰: _________________________________
  생성일: _________________________________

Studio URL: https://[project-id].sanity.studio
Studio 관리자: _________________________________
```

## GitHub 저장소

```
저장소: studiooalum/studiooalum.github.io
소유자: studiooalum
가시성: Public

GitHub Pages 설정:
  호스팅 서비스: GitHub Pages (legacy)
  배포 브랜치: main
  커스텀 도메인: studiooalum.com
  HTTPS: ☐ 활성화 (필수!)

GitHub Actions:
  Cloudflare Pages 배포: ☐ 활성화
  빌드 로그: [마지막 배포 해시]

Personal Access Token (필요 시):
  토큰: _________________________________
  권한: repo, pages, workflows
  만료: _________________________________
```

## 도메인 및 DNS

```
도메인: studiooalum.com
등록처: Gabia
등록자: _________________________________
연락처: _________________________________

등록 정보:
  생성일: _________________________________
  만료일: _________________________________
  자동 갱신: ☐ Yes ☐ No

Nameserver:
  NS1: _________________________________
  NS2: _________________________________
  NS3: _________________________________
  NS4: _________________________________

Cloudflare DNS:
  활성화: ☐ Yes
  SSL/TLS 레벨: Full (strict)
  HTTPS 강제: ☐ Yes (필수!)
  최소 TLS: 1.2
  자동 갱신: ☐ Yes

DNS 레코드:
  ☐ CNAME studiooalum.com → pages.cluster.cloudflare.net
  ☐ CNAME www.studiooalum.com → pages.cluster.cloudflare.net
  ☐ MX 레코드 (이메일 있는 경우)
  ☐ TXT SPF 레코드
```

## 데이터 백업

```
백업 전략: 월 1회 + 중요 변경 직후

최근 D1 백업:
  파일: _________________________________
  날짜: _________________________________
  크기: _________________________________
  검증: ☐ 완료
  저장소: _________________________________
  암호화 키: _________________________________

최근 docs 백업:
  파일: _________________________________
  날짜: _________________________________
  저장소: _________________________________

최근 설정 백업:
  파일: _________________________________
  날짜: _________________________________
  포함 항목: ☐ wrangler.jsonc ☐ _routes.json ☐ _headers
```

## Google Sheets (선택사항)

```
시트 이름: Studiooalum Orders
공유 링크: _________________________________
소유자: _________________________________

Apps Script Bound Script:
  프로젝트 ID: _________________________________
  웹앱 URL: https://script.google.com/macros/d/xxxxxxxxxxxxx/userweb
  마지막 배포: _________________________________
  배포 버전: _________________________________

Webhook 인증:
  공유 비밀: _________________________________
  생성일: _________________________________
```

## Delivery Tracker (선택사항)

```
서비스: tracker.delivery
계정 상태: _________________________________

API 인증:
  Client ID: _________________________________
  Client Secret: _________________________________
  발급일: _________________________________

Webhook 설정:
  URL: https://studiooalum.com/api/webhooks/delivery-tracker
  비밀: _________________________________
```

## 비상 연락처

```
Cloudflare 계정 복구:
  백업 이메일: _________________________________
  2FA 복구 코드 위치: _________________________________

Toss Payments 계정 복구:
  고객 지원: _________________________________
  대체 이메일: _________________________________

GitHub 계정 복구:
  백업 이메일: _________________________________
  2FA 복구 토큰 위치: _________________________________

도메인 복구:
  Gabia 고객 ID: _________________________________
  도메인 잠금 해제 코드: _________________________________
```

## 보안 체크리스트

```
☐ 2FA 활성화 (Cloudflare)
☐ 2FA 활성화 (Toss)
☐ 2FA 활성화 (GitHub)
☐ 2FA 복구 코드 안전 보관
☐ API 토큰 주기적 갱신 (분기별)
☐ 비밀 정보 암호화 저장
☐ 백업 정기 점검 (월 1회)
☐ 액세스 로그 모니터링
☐ 팀원 권한 재검토 (분기별)
```

## 변경 이력

```
날짜 | 변경 항목 | 상태 | 기록
─────┼──────────┼─────┼──────
      |          |      |
      |          |      |
      |          |      |
      |          |      |
```

---

**마지막 업데이트:** _______________  
**검토자:** _______________  
**확인일:** _______________
