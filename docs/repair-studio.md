# Repair Studio

## 역할 분리

- `repair.html`: 고객 수선 접수 화면. `POST /api/repairs`에 multipart 형식으로 성함, 연락처, 제품 설명, 선택 기한과 선택 사진을 보냅니다.
- `repair-admin.html`: 관리자 인증 후 접수 상태, 견적, 고객 안내 문구, 내부 메모를 관리합니다.
- D1: 요청 메타데이터와 사진의 R2 key만 저장합니다.
- R2: 새 원본 사진을 `repair-requests/<request-id>/...`로 저장합니다. 기존 `repairs/` 객체도 계속 비공개로 취급하며 공개 CDN 또는 공개 이미지 URL로 사용하지 않습니다.
- 이메일: 로그인 회원은 계정 이메일을 사용하고 비회원은 이메일을 입력합니다. 접수 및 상태 변경은 렌더링 완료된 안내를 D1 outbox에 먼저 저장하며, Resend 전달 결과는 접수/상태 저장과 분리해 기록합니다.
- 작업 이미지 기록 안내: 기타 요청사항 바로 아래의 회색 안내문으로 표시합니다. 활용을 원하지 않는 고객은 같은 요청사항에 미리 남길 수 있습니다.

## 보안 경계

1. 공개 접수 API는 이미지 key나 URL을 응답하지 않습니다.
2. 일반 `/api/r2?key=...` 경로는 `repair-requests/`와 기존 `repairs/` 접두사를 모두 404로 처리합니다.
3. 원본 이미지는 `/api/repairs/images/:id`에서만 읽고, `ORDER_ADMIN_SECRET` 기반의 짧은 bearer 세션을 요구합니다.
4. 관리자 목록 API는 R2 key 대신 인증된 이미지 스트림 경로만 제공합니다.
5. 이미지 응답은 `Cache-Control: private, no-store`를 사용합니다.
6. 고객 이미지는 회원 세션 또는 15분 guest lookup token을 확인한 `/api/repairs/customer-images/:id`에서만 제공합니다.

## 상태와 알림

- 주요 상태: `received`, `item_received`, `in_progress`, `payment_pending`, `shipping`, `closed`
- 예외 상태: `cancelled`, `rejected`
- `payment_pending`은 최종 금액과 입금/결제 안내가 필요합니다.
- `shipping`은 입금 확인일, 택배사, 운송장 번호가 필요합니다.
- `closed`는 이후 수정·문의·재발송이 금지된 읽기 전용 Archive입니다.
- 템플릿은 `repair_notification_templates`, 렌더링된 발송 본문은 `repair_notification_outbox`에 저장됩니다.
- `pending`은 5분 Scheduled Worker가 재처리합니다. timeout은 중복 방지를 위해 `unknown`, 최대 재시도 초과는 `dead_letter`로 남습니다.
- 수동 재발송은 기존 outbox를 덮어쓰지 않고 `repair.manual_resend` 이벤트와 새 outbox row를 생성합니다.

## 고객 조회

- 회원 Account 응답에는 본인 이메일과 일치하는 수선 내역이 포함됩니다.
- 비회원은 `POST /api/auth/guest-lookup` 한 폼에서 `ORD-*`, `WKS-*`, `REP-*` reference를 조회합니다.
- 성공한 조회는 DB에 hash만 저장하는 15분 access token을 반환합니다.
- 고객 문의는 단발성 기록이며 케이스당 5분 rate limit과 inquiry ID dedupe를 적용합니다.

## 배포 전 준비

1. Repair 기본 migration과 `0020_repair_notifications.sql`을 운영 D1에 적용합니다.
2. Pages에 `OALUM_DB`, `OALUM_R2`, `ORDER_ADMIN_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REPAIR_NOTIFICATION_CRON_SECRET`을 설정합니다.
3. Scheduled Worker에도 같은 `REPAIR_NOTIFICATION_CRON_SECRET`을 secret으로 설정합니다.
4. `npm run cf:repair-notifications:deploy`로 5분 cron Worker를 배포합니다.
5. `repair.html`에서 실제 접수, `repair-admin.html`에서 상태 변경·미리보기·발송 기록·원본 이미지 조회를 확인합니다.

사진이 필수인 Repair 접수에서 `OALUM_R2`가 없으면 의도적으로 `503`을 반환합니다.