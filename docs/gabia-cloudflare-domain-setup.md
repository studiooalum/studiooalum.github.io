# Gabia Domain To Cloudflare Setup

## Goal

도메인은 가비아에서 구매하거나 유지하고, 실제 DNS / SSL / 배포 / 결제 API 운영은 Cloudflare에서 처리하는 절차를 정리한다.

이 조합이 현재 사이트에는 가장 현실적이다.

- 도메인 결제와 한글 지원은 가비아
- 실제 서비스 운영은 Cloudflare
- 현재 디자인은 그대로 유지

## Recommended Target Structure

- Domain registrar: 가비아
- Authoritative DNS: Cloudflare
- SSL certificate: Cloudflare Universal SSL
- Static site: Cloudflare Pages
- API: Cloudflare Workers
- DB: Cloudflare D1

이 저장소에는 위 조합으로 옮기기 위한 스캐폴드가 들어 있다.
다만 현재 공개 정적 셸 자체는 GitHub Pages의 `main` / 루트 legacy build 기준이다.

## Why This Is Better Than Gabia Server + SSL

가비아 서버와 유료 SSL을 직접 쓰는 구조는 가능하지만, 현재처럼 저트래픽 정적 사이트에는 비용과 운영 복잡도가 더 높다.

Cloudflare 쪽은 아래를 한 번에 묶어준다.

- 무료 SSL
- CDN
- Custom domain 연결
- 정적 사이트 배포
- 서버리스 API

## Step 1. Buy Or Keep The Domain At Gabia

가비아에서 도메인을 준비한다.

- 신규 등록이면 `domain.gabia.com/regist/regist_domain`
- 기존 보유 도메인이면 그대로 사용 가능

현재 공개 페이지 기준으로 `.com` 등록가는 1년 26,400원으로 보인다.

## Step 2. Create A Cloudflare Account And Add The Domain

Cloudflare 대시보드에서 아래 순서로 진행한다.

1. Cloudflare 가입
2. `Add a site` 선택
3. 도메인 입력
4. Free plan 선택
5. 기존 DNS 레코드 스캔 결과 확인

이 단계가 끝나면 Cloudflare가 새 네임서버 2개를 발급한다.

## Step 3. Change Nameservers At Gabia

가비아에서 도메인 네임서버를 Cloudflare가 준 값으로 바꾼다.

대략적인 흐름은 아래와 같다.

1. 가비아 로그인
2. `My가비아` 또는 도메인 관리 화면 이동
3. 대상 도메인 선택
4. 네임서버 변경 메뉴 진입
5. 가비아 네임서버 대신 Cloudflare 네임서버 2개 입력
6. 저장

이후 DNS 전파를 기다린다.

## Step 4. Decide Frontend Hosting Shape

여기서 두 가지 선택지가 있다.

### Path A. Move The Static Frontend To Cloudflare Pages

가장 추천하는 방식이다.

1. Cloudflare `Workers & Pages` 진입
2. `Create application` 선택
3. `Pages` 선택
4. GitHub repository 연결
5. 현재 정적 루트를 배포 대상으로 설정
6. 배포 완료 후 `Custom domains`에서 도메인 연결

Cloudflare Pages 설정값은 아래처럼 두는 것이 맞다.

- Framework preset: `None`
- Root directory: 비워두기 또는 repo root
- Build command: `npm run cf:build`
- Build output directory: `dist`

주의:

- `Root directory`는 build 전에 이미 repo 안에 존재하는 폴더여야 한다.
- 따라서 `Root directory`를 `/dist`로 두면 clone 직후 해당 폴더가 없어서 `Failed: root directory not found`가 발생한다.
- `dist`는 `Build output directory`에만 넣는다.

장점:

- 도메인, SSL, 정적 배포가 한 플랫폼에 모임
- GitHub Pages보다 운영 구조가 더 단순함
- Workers와 연결이 자연스러움

### Path B. Current lowest-migration path if frontend stays on GitHub Pages

당장 프론트 이전을 안 하려면 가능한 현재형 경로다.

1. GitHub Pages의 custom domain 설정
2. Cloudflare DNS에서 GitHub Pages용 레코드 설정
3. Cloudflare를 DNS/SSL 앞단으로 사용
4. 결제 API만 `api.your-domain.com` 으로 Cloudflare Worker에 연결

장점:

- 즉시 전환 부담이 적음

단점:

- 최종 구조는 Pages로 옮긴 형태보다 덜 단순함

## Step 5. Attach The Custom Domain In Cloudflare

Cloudflare Pages를 쓰는 경우:

1. Pages 프로젝트 선택
2. `Custom domains` 이동
3. `Set up a domain` 선택
4. `example.com` 과 `www.example.com` 연결

중요:

- apex 도메인(`example.com`)을 쓰려면 도메인 zone이 Cloudflare에 있어야 한다.
- subdomain만 쓰는 경우에는 CNAME 방식도 가능하지만, 현재 사이트는 apex까지 같이 가져가는 편이 낫다.

## Step 6. SSL/TLS

Cloudflare는 Universal SSL을 무료로 제공한다. 따라서 보통 별도 유료 SSL을 구매할 필요가 없다.

정리하면:

- Cloudflare Pages + Workers 조합: 별도 SSL 구매 불필요
- GitHub Pages를 Cloudflare 앞단에 둘 때도 Cloudflare에서 HTTPS 제공 가능

즉, 현재 사이트 목표에서는 가비아 유료 SSL 상품을 먼저 살 이유가 거의 없다.

## Step 7. Add API Subdomain

결제 API는 별도 서브도메인으로 분리하면 가장 깔끔하다.

추천 예시:

- `www.example.com` 또는 `example.com`: 정적 프론트
- `api.example.com`: Workers API

Workers 쪽에는 아래 API를 붙인다.

- `/api/orders`
- `/api/payments/confirm`
- `/api/webhooks/toss`

## Step 8. Bind D1

Cloudflare D1에 최소 주문 테이블을 만든다.

초기에는 아래 정도면 충분하다.

- `orders`
- `order_items`
- `payments`
- `payment_events`

## Recommended Decision

현재 사이트 기준으로 가장 추천하는 조합은 아래다.

- 도메인: 가비아
- DNS / SSL / 정적 배포 / API / DB: Cloudflare

즉, 가비아에서 서버까지 같이 사는 것보다 아래가 더 효율적이다.

- `가비아 도메인 + Cloudflare 운영`

## Quick Decision Table

### 가장 싼 운영

- 가비아 도메인
- Cloudflare Pages Free
- Cloudflare Workers Paid
- Cloudflare D1

### 가장 적은 초기 변경

- 가비아 도메인
- Cloudflare DNS / SSL
- GitHub Pages 유지
- Workers + D1만 추가

### 비추천

- 가비아 클라우드 서버 + 가비아 유료 SSL

현재 사이트 규모에서는 비용 대비 이점이 작다.