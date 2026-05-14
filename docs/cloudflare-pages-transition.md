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

## Current Deployment Reality

현재 저장소는 두 경로를 구분해서 봐야 한다.

- GitHub 쪽에는 `main` push 때 자동으로 도는 `pages-build-deployment`가 이미 연결되어 있다.
- 그래서 정적 루트 페이지 변경만 배포할 때는 GitHub에 push하면 자동 반영되는 흐름이 맞다.
- `wrangler pages deploy`는 이 기본 정적 배포 경로를 대신하는 명령이 아니라, Cloudflare Pages 런타임을 직접 배포할 때만 필요하다.
- `functions/api/*`, D1, 인증 세션, OAuth callback은 GitHub Pages만으로는 서비스할 수 없으므로 Cloudflare Pages 또는 Workers 프로젝트가 실제로 연결되어 있어야 한다.

원격 dev container나 Codespaces에서는 브라우저 기반 `wrangler login`을 다시 시도하지 않는다.
Cloudflare 인증 callback이 localhost로 돌아오면서 실패할 수 있으므로, Cloudflare 쪽 배포가 필요하면 아래 둘 중 하나만 사용한다.

1. Cloudflare Dashboard에서 GitHub repo를 직접 연결한 자동 배포
2. API token 기반의 비브라우저 배포

## API Token Runbook

원격 dev container, Codespaces, 에이전트 실행 환경에서는 `wrangler login` 대신 API token만 사용한다.

- 토큰은 Cloudflare Dashboard의 account 화면이 아니라 `My Profile -> API Tokens` 에서 만든 user API token을 사용한다.
- account-owned token은 Wrangler에서 `/memberships` 오류를 낼 수 있으므로 기본값으로 쓰지 않는다.

권장 권한:

- `Account / D1 / Edit`: D1 조회, 마이그레이션, execute
- `Account / Cloudflare Pages / Edit`: Pages 배포, 프로젝트 조회
- `Account / Workers Scripts / Edit`: 바인딩이나 런타임 설정을 Wrangler로 갱신할 때만 추가
- `User / User Details / Read`: 선택 사항. `wrangler whoami`의 이메일 경고를 줄이는 용도

현재 저장소에서 반복해서 쓰는 값:

- Pages project name: `studiooalum`
- D1 database name: `oalum-orders`
- D1 binding name: `OALUM_DB`

로컬 보관 방식:

```bash
mkdir -p ~/.config
cat > ~/.config/oalum-cloudflare.env <<'EOF'
export CLOUDFLARE_API_TOKEN='replace-me'
export CLOUDFLARE_ACCOUNT_ID='90bda4dea6a6cef40998a3b291172b8a'
EOF
chmod 600 ~/.config/oalum-cloudflare.env
```

Cloudflare 명령을 실행하기 전에는 항상 먼저 아래를 실행한다.

```bash
source ~/.config/oalum-cloudflare.env
```

첫 확인 명령:

```bash
npx --yes wrangler whoami
npx --yes wrangler d1 list
npx --yes wrangler pages project list
```

토큰이나 권한 문제를 빠르게 판별하는 기준:

- `You are logged in with an User API Token` 이 보이면 토큰 타입은 맞다.
- `Account API Token` 또는 `/memberships` 오류가 보이면 user API token으로 다시 만든다.
- remote D1 조회는 되지만 custom domain `curl` 응답이 challenge HTML이면, Pages 최신 `*.pages.dev` 배포 URL로 먼저 검증한다.

## Included Routes

- `POST /api/orders`
- `POST /api/payments/confirm`
- `POST /api/webhooks/toss`
- `GET /api/health`

## Important Behavior

현재 루트 정적 storefront를 깨지 않기 위해 checkout과 payment 스크립트는 아래 방식으로 동작한다.

- `/api/orders`가 있으면 서버 주문 생성 사용
- `/api/orders`가 없으면 로컬 preview 주문으로 자동 fallback
- `/api/payments/confirm`이 있으면 서버 승인 사용
- `/api/payments/confirm`이 없으면 현재 success 페이지 preview 흐름 유지

즉, 루트 정적 storefront를 그대로 유지해도 기존 흐름이 유지된다.

## Before Real Launch

실결제를 열기 전에는 아래 값을 Cloudflare Pages 프로젝트에 설정해야 한다.

- `TOSS_SECRET_KEY`
- `TOSS_CLIENT_KEY` 또는 `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `OALUM_DB` D1 binding
- `ORDER_SYNC_WEBHOOK_URL` optional, if Google Sheets/email sync is enabled
- `ORDER_SYNC_SHARED_SECRET` optional but strongly recommended for Google Sheets/email sync
- `ORDER_NOTIFICATION_EMAILS` optional comma-separated recipients for order alerts

주의할 점은 용도가 다르다는 것이다.

- `TOSS_SECRET_KEY`: 서버 결제 승인용. Pages Functions 런타임에서만 사용한다.
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` 또는 `TOSS_CLIENT_KEY`: 결제 위젯용 공개 키. `npm run cf:build` 시 `dist/payment.html`의 meta tag에 주입된다.

로컬에서 공개 키를 넣어 build 하려면 아래처럼 실행한다.

```bash
NEXT_PUBLIC_TOSS_CLIENT_KEY="live_gck_..." npm run cf:build
```

Cloudflare Pages에서는 아래처럼 나누는 편이 안전하다.

1. `NEXT_PUBLIC_TOSS_CLIENT_KEY`는 Pages environment variable로 설정
2. `TOSS_SECRET_KEY`는 Pages secret으로 설정
3. Google Sheets 연동을 쓸 경우 `ORDER_SYNC_WEBHOOK_URL`과 `ORDER_SYNC_SHARED_SECRET`를 Pages secret으로 설정
4. 알림 수신자를 Cloudflare 쪽에서 관리하려면 `ORDER_NOTIFICATION_EMAILS`를 Pages environment variable로 설정

Google Sheets와 이메일 알림 연동 방법은 `docs/google-sheets-order-sync.md`를 따른다.

## D1 Schema

아래 파일을 기준으로 D1 테이블을 만든다.

- `cloudflare/d1/schema.sql`

현재 스키마는 주문 상태 정규화, 결제 재시도 이력, 웹훅 멱등성까지 반영한 버전이다.
이미 예전 D1 개발 DB를 만들었다면, 실오픈 전에는 새 DB를 다시 만들거나 스키마 마이그레이션을 적용하는 편이 안전하다.

## D1 Setup Commands

처음부터 새로 만드는 기준 명령은 아래와 같다.

```bash
npx wrangler d1 create oalum-orders
```

위 명령 결과의 `database_id`를 `wrangler.jsonc`의 `d1_databases`에 추가한다.

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "studiooalum-pages",
	"pages_build_output_dir": "./dist",
	"compatibility_date": "2026-04-27",
	"d1_databases": [
		{
			"binding": "OALUM_DB",
			"database_name": "oalum-orders",
			"database_id": "<wrangler d1 create 결과의 database_id>"
		}
	]
}
```

그다음 스키마를 반영한다.

```bash
npx wrangler d1 execute oalum-orders --file=./cloudflare/d1/schema.sql
```

Cloudflare Pages 프로젝트에도 같은 이름의 D1 바인딩 `OALUM_DB`를 연결해야 한다.

설정 뒤에는 아래 순서로 확인한다.

1. `npm run cf:build`
2. `npm run cf:pages:dev`
3. `/api/health` 에서 `bindings.d1=true`, `bindings.strictPersistence` 값 확인
4. 테스트 주문 생성 후 D1에서 `orders`, `payments`, `payment_events` 적재 확인

## Recommended Next Step

1. Cloudflare Pages 프로젝트 생성
2. 이 저장소 연결
3. build output을 `dist`로 사용
4. D1 binding 추가
5. Toss 키 추가
6. 테스트 결제 검증