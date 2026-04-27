# Cloudflare Pages Transition

## What This Adds

이 저장소에는 Cloudflare Pages로 옮길 수 있도록 최소 전환 작업이 추가되었습니다.

- `dist/` 정적 출력 생성 스크립트
- `wrangler.jsonc` Pages 설정 파일
- `functions/api/*` Pages Functions 스캐폴드
- `cloudflare/d1/schema.sql` 최소 주문 스키마

## Local Commands

```bash
npm run cf:build
npm run cf:pages:dev
```

- `cf:build`: 현재 루트 HTML과 정적 자산을 `dist/`로 복사
- `cf:pages:dev`: `dist/`를 기준으로 Cloudflare Pages 로컬 개발 실행

## Included Routes

- `POST /api/orders`
- `POST /api/payments/confirm`
- `POST /api/webhooks/toss`
- `GET /api/health`

## Important Behavior

현재 GitHub Pages 공개 사이트를 깨지 않기 위해 checkout과 payment 스크립트는 아래 방식으로 동작한다.

- `/api/orders`가 있으면 서버 주문 생성 사용
- `/api/orders`가 없으면 로컬 preview 주문으로 자동 fallback
- `/api/payments/confirm`이 있으면 서버 승인 사용
- `/api/payments/confirm`이 없으면 현재 success 페이지 preview 흐름 유지

즉, 지금처럼 GitHub Pages에서 계속 열어도 기존 흐름이 유지된다.

## Before Real Launch

실결제를 열기 전에는 아래 값을 Cloudflare Pages 프로젝트에 설정해야 한다.

- `TOSS_SECRET_KEY`
- `TOSS_CLIENT_KEY` 또는 `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `OALUM_DB` D1 binding

## D1 Schema

아래 파일을 기준으로 D1 테이블을 만든다.

- `cloudflare/d1/schema.sql`

## Recommended Next Step

1. Cloudflare Pages 프로젝트 생성
2. 이 저장소 연결
3. build output을 `dist`로 사용
4. D1 binding 추가
5. Toss 키 추가
6. 테스트 결제 검증