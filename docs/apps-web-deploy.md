# apps/web Deployment Notes

## Goal

`apps/web`를 GitHub Pages와 별개로 Vercel 같은 서버 런타임에 올려서 주문 생성, 결제 승인, 웹훅 처리가 가능한 구조로 전환한다.

## Current Constraint

- 현재 공개 사이트는 GitHub Pages + `runtime/storefront` 기준이다.
- `apps/web`는 Next.js storefront 목적지이지만, 아직 실제 DB 저장과 토스 운영 승인 로직은 붙지 않았다.
- 따라서 현재 단계에서 Vercel 전환은 "준비"까지 가능하고, 실제 오픈 전환은 DB와 운영 키가 준비된 뒤 진행해야 한다.

## Recommended Vercel Setup

Vercel 프로젝트 생성 시 아래처럼 맞춘다.

1. Repository: 현재 GitHub 저장소 연결
2. Root Directory: 저장소 루트 유지
3. Install Command: `npm install`
4. Build Command: `npm run web:build`
5. Development Command: `npm run web:dev`

`apps/web`가 아직 별도 `package.json` 경계를 갖고 있지 않아서, 현재 기준으로는 저장소 루트에서 빌드 명령을 실행하는 방식이 가장 단순하다.

## Required Environment Variables

Vercel 환경변수에는 최소 아래 값이 필요하다.

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `NEXT_PUBLIC_SANITY_DATASET`
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `DATABASE_URL`

## Deployment Order

1. Postgres 인스턴스 생성
2. [docs/commerce-schema.sql](./commerce-schema.sql) 적용
3. `apps/web/app/api/orders/route.js`를 DB insert 기반으로 교체
4. `apps/web/app/api/payments/confirm/route.js`를 토스 secret-key 승인 요청으로 교체
5. 토스 웹훅 엔드포인트 추가 및 `payment_events` 적재
6. Vercel preview 배포에서 실주문 없이 승인 흐름 검증
7. 도메인 연결 후 루트 Pages 셸을 단계적으로 축소

## Rollout Advice

- 정식 전환 전에는 `shop`, `product`, `edition` 라우트부터 먼저 parity 확인
- `checkout`, `payment`, `success`, `fail`은 DB 저장과 운영 승인 후에만 외부 트래픽 오픈
- GitHub Pages는 완전 대체 전까지 계속 fallback 공개면으로 유지