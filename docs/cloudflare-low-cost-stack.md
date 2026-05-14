# Lowest-Cost Production Stack

## Goal

현재 HTML, CSS, JavaScript 디자인을 유지한 채로 실제 결제를 열 수 있는 가장 저렴한 운영 구조를 잡는다.

현재 공개 정적 셸은 GitHub Pages의 `main` / 루트 legacy build 기준이다.
인증·주문·결제 같은 서버 기능과 이후 통합 경로는 Cloudflare 런타임 기준으로 준비돼 있다.

핵심 원칙은 아래와 같다.

- 프론트 디자인은 버리지 않는다.
- 서버는 결제 승인과 주문 저장에 필요한 만큼만 둔다.
- 트래픽이 매우 적다는 전제를 비용 구조에 반영한다.

## Recommended Stack

- Frontend code: 현재 루트 HTML + `runtime/storefront/*`
- Static hosting now: GitHub Pages legacy build
- Static hosting after consolidation: Cloudflare Pages Free
- API: Cloudflare Workers Paid
- Order DB: Cloudflare D1
- Domain: 가비아 또는 Cloudflare Registrar
- DNS / SSL: Cloudflare
- Payment: Toss Payments live widget + server confirmation
- CMS: 현재처럼 Sanity 유지 가능, 필요 없으면 추후 축소 가능

## Why This Is The Cheapest Practical Path

현재 사이트는 거의 정적 사이트에 가깝고, 서버가 필요한 부분은 아래 세 가지뿐이다.

- 주문 생성
- 결제 승인 확인
- 웹훅 수신

그래서 `Vercel + Postgres` 같이 항상 서버 앱을 운영하는 구조보다, `Cloudflare Pages + Workers + D1`처럼 필요한 요청 때만 비용이 붙는 구조가 훨씬 유리하다.

특히 저트래픽 사이트에서는 정적 호스팅과 서버리스 API의 조합이 가장 단순하고 저렴하다.

## Cost Shape

2026-04 기준으로 보수적으로 보면 아래 정도가 시작점이다.

- Cloudflare Pages Free: 정적 사이트 호스팅 비용 0
- Cloudflare Workers Paid: 월 5달러부터
- Cloudflare D1: 저트래픽이면 무료 구간으로 시작 가능
- 가비아 `.com` 도메인: 현재 노출가 기준 연 26,400원

즉, 실제 운영 오픈 시점의 인프라 최소 비용은 대체로 아래 범위로 보면 된다.

- 월 인프라: 약 5달러 전후
- 연 도메인: 26,400원 전후
- 별도: Toss 결제 수수료

환율, 부가세, 카드사 해외 결제 수수료는 별도다.

## Recommended Production Shapes

### Option A. Lowest-cost final form

가장 추천하는 형태다.

- 정적 프론트: Cloudflare Pages
- API: Cloudflare Workers
- 주문 저장: D1
- DNS / SSL / Custom domain: Cloudflare

장점:

- 현재 디자인 그대로 유지 가능
- 정적 사이트와 결제 API가 같은 플랫폼에 모임
- HTTPS, CDN, 도메인 연결이 단순함
- 운영비가 가장 낮음

### Option B. Current lowest-migration path

현재 공개 정적 셸과 가장 가까운 형태다.

- 정적 프론트: GitHub Pages 유지
- API: `api.your-domain.com` 을 Cloudflare Worker로 분리
- 주문 저장: D1
- DNS / SSL: Cloudflare

장점:

- 프론트 이전 작업이 거의 없음
- 현재 공개 사이트를 건드리는 범위가 가장 작음

단점:

- Pages로 옮긴 구조보다 최종 운영 구성이 덜 깔끔함

## Minimum Backend Scope

실제 결제를 열기 위해 필요한 최소 API는 아래 세 개다.

### `POST /api/orders`

- 주문 번호 생성
- 주문자 정보 저장
- 주문 상품 저장
- 결제 전 상태로 주문 생성

### `POST /api/payments/confirm`

- Toss에서 받은 `paymentKey`, `orderId`, `amount` 검증
- Toss 승인 API 호출
- 승인 결과 저장

### `POST /api/webhooks/toss`

- 비동기 결제 이벤트 저장
- 결제/취소/실패 상태 동기화

## Minimum D1 Tables

처음에는 Postgres 수준으로 크게 갈 필요가 없다. 아래 정도면 충분하다.

- `orders`
- `order_items`
- `payments`
- `payment_events`

배송 기능을 나중에 붙일 거면 이후 `shipments` 테이블을 추가하면 된다.

## What Stays Unchanged

이 구조로 가도 아래는 그대로 유지할 수 있다.

- 현재 페이지 디자인
- 현재 HTML 구조
- 현재 CSS 자산
- 현재 JavaScript 상호작용
- 현재 상품 상세/에디션 레이아웃

즉, 아임웹처럼 디자인을 다시 조립할 필요가 없다.

## Rollout Order

1. Custom domain을 확보한다.
2. Cloudflare에 도메인을 붙이고 SSL을 활성화한다.
3. 현재처럼 GitHub Pages를 유지할지, Cloudflare Pages로 통합할지 먼저 결정한다.
4. Workers에 주문 생성 / 결제 승인 / 웹훅 API를 만든다.
5. D1에 최소 주문 스키마를 만든다.
6. Toss live key를 넣고 실결제를 검증한다.
7. 마지막으로 공개 결제를 연다.

실제 스캐폴드와 명령어는 아래 문서를 참고한다.

- `docs/cloudflare-pages-transition.md`
- `cloudflare/d1/schema.sql`
- `functions/api/*`

## Not Recommended For This Site

트래픽이 매우 적고 디자인 유지가 중요한 현재 상황에서는 아래 조합은 비효율적이다.

- Vercel Pro + managed Postgres
- 가비아 클라우드 서버 + 유료 SSL 조합

이 구조들은 나쁘지 않지만, 현재 사이트 규모와 운영비 목표에는 과하다.