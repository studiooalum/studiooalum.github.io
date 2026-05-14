# Current Repository Architecture

## Goal

현재 루트 정적 storefront와 GitHub Pages 정적 배포를 유지하고, 서버 기능은 Cloudflare 런타임으로 보강하면서도 정식 오픈용 구조로 무리 없이 이동할 수 있는 저장소 경계를 만든다.

## Current Runtime Boundaries

### 1. Public root storefront shell

- 루트의 `index.html`, `shop.html`, `product.html`, `checkout.html` 등
- GitHub Pages의 `main` / 루트 legacy build에서 직접 노출되는 공개 진입점

### 2. Shared live runtime

- `runtime/storefront/styles/*`
- `runtime/storefront/scripts/*`

대부분의 루트 페이지가 이 경로를 직접 참조하므로, 현재 운영 단계에서는 사실상 라이브 런타임입니다.

### 3. Legacy root-only assets

- `styles/*`
- `scripts/*`

초기 루트 페이지가 사용 중인 자산입니다.

### 4. Cloudflare server runtime

- `functions/api/*`
- `cloudflare/lib/*`
- `cloudflare/d1/*`

인증, 주문 생성, 결제 승인, 웹훅 처리, D1 저장은 이 경로를 통해 동작합니다.

### 5. Optional local-only workspaces

- `apps/studio/` 같은 co-located Sanity Studio 경로
- `archive/local/site-prototype/` 같은 비추적 실험 경로

이 경로들은 현재 저장소에 포함되지 않으며, 필요할 때만 로컬 비추적 경로로 둡니다.

### 6. Next storefront scaffold

- `apps/web/*`
- Next.js App Router 기반의 다음 storefront 골격
- 현재는 홈, Sanity 연동 샵/제품/에디션 라우트, 체크아웃/결제 프리뷰 흐름, API 라우트(`/api/orders`, `/api/payments/confirm`)까지 제공

즉, `apps/web`는 운영 전환을 위한 목적지이고, 당장 공개 중인 루트 storefront 셸을 대체하지는 않습니다.

## Why runtime/storefront Exists

기존에는 루트 페이지 다수가 `./v1/src/styles/...` 와 `./v1/src/scripts/...` 를 직접 읽고 있었습니다. 이 의존성을 끊기 위해 라이브 자산만 `runtime/storefront/`로 먼저 분리했습니다.

정리 원칙은 다음과 같습니다.

1. 라이브 경로를 깨뜨리지 않는다.
2. 공개 런타임과 레거시 HTML 셸을 분리한다.
3. 공개 사이트와 로컬 전용 repo를 분리한다.
4. 다음 storefront 앱의 목적지를 미리 만든다.

## Recommended Production Direction

현재 저장소에는 두 가지 운영 방향이 공존합니다.

### 1. Full app direction

정식 앱 전환을 길게 보면 아래 구조가 목적지입니다.

- `apps/web`: Next.js storefront
- 별도 저장소 또는 필요 시 co-located `apps/studio`: Sanity Studio
- Postgres: 주문/결제 상태 저장
- PG direct: 토스 우선, 서버 승인/웹훅 필수

관련 초안 문서:

- `docs/commerce-schema.sql`: 주문, 결제, 배송, 웹훅 적재용 Postgres 초안
- `docs/apps-web-deploy.md`: `apps/web`의 Vercel 전환 체크리스트

### 2. Lowest-cost production direction

현재처럼 트래픽이 적고 디자인 유지가 중요한 상황에서는 아래 경로를 우선 추천합니다.

- 루트 정적 사이트 디자인 유지
- GitHub Pages: 현재 공개 정적 셸 배포
- Cloudflare Pages: 정적과 API를 한 플랫폼으로 통합할 때의 다음 후보
- Cloudflare Workers: 주문/결제 API
- Cloudflare D1: 주문 저장
- Cloudflare DNS / SSL: custom domain과 HTTPS

관련 문서:

- `docs/cloudflare-low-cost-stack.md`: 최저비용 운영 구조 정리
- `docs/gabia-cloudflare-domain-setup.md`: 가비아 도메인 + Cloudflare 운영 절차

## Migration Order

### Low-cost order first

1. custom domain 확보
2. Cloudflare DNS / SSL 연결
3. 정적 프론트는 루트 디자인 그대로 유지
4. Workers에 주문 생성 / 결제 승인 / 웹훅 API 구축
5. D1에 최소 주문 테이블 구축
6. Toss live 검증 후 실결제 오픈

### Full app order later

1. `apps/web` 스캐폴드를 실제 storefront로 확장
2. Sanity 읽기 코드를 서버 중심으로 이동
3. 주문 생성과 결제 승인 API 구축
4. 루트 storefront 페이지를 점진적으로 `apps/web` 결과물로 대체
5. 더 이상 쓰지 않는 self-contained 레거시 HTML 셸은 `archive/legacy/`에 보관