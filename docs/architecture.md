# Current Repository Architecture

## Goal

현재 GitHub Pages 사이트를 유지하면서도, 정식 오픈용 구조로 무리 없이 이동할 수 있는 저장소 경계를 만든다.

## Current Runtime Boundaries

### 1. Public GitHub Pages shell

- 루트의 `index.html`, `shop.html`, `product.html`, `checkout.html` 등
- GitHub Pages에서 직접 노출되는 공개 진입점

### 2. Shared live runtime

- `runtime/storefront/styles/*`
- `runtime/storefront/scripts/*`

대부분의 루트 페이지가 이 경로를 직접 참조하므로, 현재 운영 단계에서는 사실상 라이브 런타임입니다.

### 3. Legacy root-only assets

- `styles/*`
- `scripts/*`

초기 루트 페이지가 사용 중인 자산입니다.

### 4. Local-only workspaces

- `apps/studio/`
- `archive/local/site-prototype/`

이 둘은 메인 GitHub Pages 배포 대상이 아니며, 로컬 실험/편집용 repo입니다.

### 5. Next storefront scaffold

- `apps/web/*`
- Next.js App Router 기반의 다음 storefront 골격
- 현재는 홈, Sanity 연동 샵/제품/에디션 라우트, 체크아웃/결제 프리뷰 흐름, API 라우트(`/api/orders`, `/api/payments/confirm`)까지 제공

즉, `apps/web`는 운영 전환을 위한 목적지이고, 당장 공개 중인 루트 Pages 셸을 대체하지는 않습니다.

## Why runtime/storefront Exists

기존에는 루트 페이지 다수가 `./v1/src/styles/...` 와 `./v1/src/scripts/...` 를 직접 읽고 있었습니다. 이 의존성을 끊기 위해 라이브 자산만 `runtime/storefront/`로 먼저 분리했습니다.

정리 원칙은 다음과 같습니다.

1. 라이브 경로를 깨뜨리지 않는다.
2. 공개 런타임과 레거시 HTML 셸을 분리한다.
3. 공개 사이트와 로컬 전용 repo를 분리한다.
4. 다음 storefront 앱의 목적지를 미리 만든다.

## Recommended Production Direction

정식 오픈 구조는 아래를 목표로 합니다.

- `apps/web`: Next.js storefront
- `apps/studio`: Sanity Studio
- Postgres: 주문/결제 상태 저장
- PG direct: 토스 우선, 서버 승인/웹훅 필수

## Migration Order

1. `apps/web` 스캐폴드를 실제 storefront로 확장
2. Sanity 읽기 코드를 서버 중심으로 이동
3. 주문 생성과 결제 승인 API 구축
4. 루트 Pages 페이지를 점진적으로 `apps/web` 결과물로 대체
5. 더 이상 쓰지 않는 레거시 HTML 셸은 `archive/legacy/`에 보관