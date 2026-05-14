# Google Sheets Order Sync

현재 Cloudflare Pages 주문 흐름은 주문 생성, 결제 확정, Toss 웹훅 처리 직후에 외부 webhook으로 주문 스냅샷을 보낼 수 있다.
이 문서는 그 webhook 대상을 Google Apps Script 웹앱으로 두고,

- Google Sheets에 주문 정보를 업서트하고
- 주요 결제 이벤트에서 이메일 알림을 보내는

구성을 설명한다.

## What This Uses

- Cloudflare Pages Functions
- `ORDER_SYNC_WEBHOOK_URL`
- `ORDER_SYNC_SHARED_SECRET`
- optional `ORDER_NOTIFICATION_EMAILS`
- Google Sheets bound Apps Script web app

Cloudflare 쪽 구현은 아래 파일에 있다.

- [cloudflare/lib/order-sync.js](cloudflare/lib/order-sync.js)
- [functions/api/orders.js](functions/api/orders.js)
- [functions/api/payments/confirm.js](functions/api/payments/confirm.js)
- [functions/api/webhooks/toss.js](functions/api/webhooks/toss.js)

Google Apps Script 예시는 아래 파일을 그대로 붙여 넣으면 된다.

- [docs/google-order-sync-webhook.js](docs/google-order-sync-webhook.js)

## Event Behavior

Cloudflare는 아래 이벤트에서 주문 스냅샷을 보낸다.

- `order.created`: 신규 주문 생성, 이메일 발송 안 함
- `payment.confirmed`: 결제 완료, 이메일 발송 가능
- `payment.failed`: 결제 실패, 이메일 발송 가능
- `payment.cancelled`: 결제 취소, 이메일 발송 가능
- `payment.refunded`: 환불 처리, 이메일 발송 가능
- `payment.pending` / `payment.authorized` / `payment.updated`: 시트 업데이트만

웹훅 중복은 Cloudflare 쪽에서 먼저 걸러지고, 이메일은 Apps Script에서 `emailKey` 기준으로 한 번 더 중복 방지한다.

## Step 1. Create The Google Sheet

1. 새 Google Sheet를 만든다.
2. 이름은 자유롭게 정해도 된다.
3. 이 시트 안에 Apps Script를 bound script로 붙일 것이므로, 시트 화면에서 Extensions > Apps Script로 들어간다.

## Step 2. Paste The Apps Script

1. 기본으로 생성된 코드 내용을 지운다.
2. [docs/google-order-sync-webhook.js](docs/google-order-sync-webhook.js) 전체를 붙여 넣는다.
3. 저장한다.

스크립트는 자동으로 아래 시트를 만든다.

- `Orders`
- `OrderEvents`

## Step 3. Set Script Properties

Apps Script 편집기에서 Project Settings > Script Properties에 아래 값을 넣는다.

필수:

- `ORDER_SYNC_SHARED_SECRET`: Cloudflare와 같은 랜덤 문자열

선택:

- `ORDER_NOTIFICATION_EMAILS`: `a@example.com,b@example.com` 형식

이메일 수신자를 Cloudflare Pages에서 관리할 생각이면 `ORDER_NOTIFICATION_EMAILS`는 비워도 된다.

## Step 4. Deploy As Web App

1. Deploy > New deployment
2. Type: Web app
3. Execute as: `Me`
4. Who has access: `Anyone`
5. Deploy
6. 발급된 Web app URL을 복사한다.

이 URL이 Cloudflare의 `ORDER_SYNC_WEBHOOK_URL` 값이 된다.

## Step 5. Add Cloudflare Pages Variables

Cloudflare Pages 프로젝트 `studiooalum`에 아래 값을 추가한다.

권장 secret:

- `ORDER_SYNC_WEBHOOK_URL`
- `ORDER_SYNC_SHARED_SECRET`

선택 environment variable:

- `ORDER_NOTIFICATION_EMAILS`

수신자를 Cloudflare에서 관리하면 Apps Script script property 없이도 이메일이 간다.

## Suggested Wrangler Commands

비밀값은 아래처럼 넣는 편이 안전하다.

```bash
printf '%s' 'https://script.google.com/macros/s/REPLACE_ME/exec' | npx wrangler pages secret put ORDER_SYNC_WEBHOOK_URL --project-name studiooalum
printf '%s' 'replace-with-random-secret' | npx wrangler pages secret put ORDER_SYNC_SHARED_SECRET --project-name studiooalum
```

`ORDER_NOTIFICATION_EMAILS`는 대시보드에서 일반 environment variable로 넣거나, 필요하면 API로 관리한다.

## Step 6. Redeploy Pages

환경변수 반영 후에는 새 배포가 한 번 필요하다.

```bash
npm run cf:build
npx wrangler pages deploy dist --project-name studiooalum --branch manual-order-sync-check --commit-dirty=true --commit-message "Enable order sync webhook"
```

## Step 7. Verify

1. preview 또는 production에서 `/api/health` 확인
2. `bindings.orderSync`가 `true`인지 확인
3. 테스트 주문 생성
4. `Orders` 시트에 한 줄이 생기는지 확인
5. 결제 확정 또는 preview 결제 확인 후 `OrderEvents`에 이벤트가 추가되는지 확인
6. `payment.confirmed` 이벤트에서 이메일이 도착하는지 확인

## Notes

- 현재 구조는 Google Sheets를 주문 운영용 보조 채널로 쓰는 방식이다. 주문 원본 데이터는 여전히 D1이다.
- 시트 row는 `Order ID` 기준으로 업서트된다.
- 이벤트 로그는 `OrderEvents` 시트에 append-only로 쌓인다.
- 이메일은 `payment.confirmed`, `payment.failed`, `payment.cancelled`, `payment.refunded`에서만 보낸다.
- Apps Script의 메일 발송 한도는 Google Workspace/개인 계정 정책에 따라 다르다.