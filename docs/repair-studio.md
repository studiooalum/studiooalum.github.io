# Repair Studio

## 역할 분리

- `repair.html`: 고객 수선 접수 화면. `POST /api/repairs`에 multipart 형식으로 성함, 연락처, 제품 설명, 선택 기한과 선택 사진을 보냅니다.
- `repair-admin.html`: 수선 신청 관리와 Repair Studio 콘텐츠 관리 두 탭을 제공합니다. 고객 대화는 선택한 case의 Repair Ticket에서 진행합니다.
- `repair-ticket.html`: 고객·관리자·system 메시지와 사진을 case별 대화 기록으로 표시합니다.
- `notification-admin.html`: 비개발자가 이메일/SMS 초안, 미리보기, 테스트, 활성화, 복원과 실패 재시도를 관리합니다.
- D1: 수선 요청, Ticket, 메시지, 첨부 metadata, 템플릿, 수정 이력과 outbox를 저장합니다.
- R2: 접수 사진은 `repair-requests/<request-id>/...`, Ticket 사진은 `repair-tickets/<ticket-id>/...`에 비공개로 저장합니다.
- 이메일/SMS: 상태 변경 transaction은 렌더링 완료된 알림을 `notification_outbox`에 먼저 저장하고 Resend/SOLAPI 결과를 별도로 기록합니다.
- 작업 이미지 기록 안내: 기타 요청사항 바로 아래의 회색 안내문으로 표시합니다. 활용을 원하지 않는 고객은 같은 요청사항에 미리 남길 수 있습니다.

## 보안 경계

1. 공개 접수 API는 이미지 key나 URL을 응답하지 않습니다.
2. 일반 `/api/r2?key=...` 경로는 `repair-requests/`, `repair-tickets/`, 기존 `repairs/` 접두사를 모두 404로 처리합니다.
3. 원본 이미지는 `/api/repairs/images/:id`에서만 읽고, `ORDER_ADMIN_SECRET` 기반의 짧은 bearer 세션을 요구합니다.
4. 관리자 목록 API는 R2 key 대신 인증된 이미지 스트림 경로만 제공합니다.
5. 이미지 응답은 `Cache-Control: private, no-store`를 사용합니다.
6. 고객 이미지는 회원 세션 또는 15분 guest lookup token을 확인한 `/api/repairs/customer-images/:id`에서만 제공합니다.
7. Ticket 첨부는 관리자 bearer, 회원 세션, guest lookup token 또는 7일 만료 서명 링크를 확인한 `/api/repairs/ticket-attachments/:id`에서만 제공합니다.

## 상태와 알림

- 주요 상태: `received`, `item_received`, `in_progress`, `payment_pending`, `shipping`, `closed`
- 예외 상태: `cancelled`, `rejected`
- `payment_pending`은 최종 금액과 입금/결제 안내가 필요합니다.
- `shipping`은 입금 확인일, 택배사, 운송장 번호가 필요합니다.
- `closed`는 이후 수정·문의·재발송이 금지된 읽기 전용 Archive입니다.
- 외부 milestone은 `repair.application_submitted`, `repair.received`, `repair.repair_completed_quote_ready`, `repair.payment_confirmed_shipping_started` 네 개입니다.
- 나머지 상태 변경은 Ticket system 메시지와 `ticket.system_message_to_customer` 이메일만 생성합니다.
- `shipping` milestone 한 건에 입금 확인, 배송 시작, 운송장, 조회 링크, Ticket 링크를 함께 담습니다.
- 템플릿은 `notification_templates`, 렌더링된 발송 본문은 `notification_outbox`에 저장됩니다. 기존 Repair 전용 테이블은 migration 기간 동안 읽기/처리 호환을 유지합니다.
- `pending`은 5분 Scheduled Worker가 재처리합니다. timeout은 중복 방지를 위해 `unknown`, 최대 재시도 초과는 `dead_letter`로 남습니다.
- 수동 재발송은 기존 outbox를 덮어쓰지 않고 새 outbox row와 revision 기록을 생성합니다.
- 국내(`country_code=KR`) milestone은 SOLAPI SMS/LMS, 해외/미확인은 Resend 이메일을 사용합니다. Ticket 메시지는 국가와 무관하게 이메일만 사용합니다.
- `SMS_ENABLED=false` 또는 `SMS_DRY_RUN=true`에서는 SOLAPI를 호출하지 않고 dry-run을 기록한 뒤 이메일 fallback을 생성합니다.
- Shop/Workshop 템플릿은 기존 외부 order-sync/예약 발송 경로의 회귀를 피하기 위한 전환 준비 초안입니다. Notification Admin에서 편집·미리보기·테스트는 가능하지만 실제 활성화는 차단합니다.

## 고객 조회

- 회원 Account 응답에는 본인 이메일과 일치하는 수선 내역이 포함됩니다.
- 비회원은 `POST /api/auth/guest-lookup` 한 폼에서 `ORD-*`, `WKS-*`, `REP-*` reference를 조회합니다.
- 성공한 조회는 DB에 hash만 저장하는 15분 access token을 반환합니다.
- 통합 조회 성공 시 opaque Ticket ID와 15분 guest token으로 Ticket에 접근합니다. URL에는 고객 이름, 전화번호, 이메일, 수선 번호를 넣지 않습니다.
- Ticket 메시지는 5분 제한 없이 연속 작성할 수 있으며, 분당 slot 제한·동일 본문 반복 차단·client message ID dedupe를 적용합니다.
- 이메일의 Ticket 바로가기에는 7일 만료 HMAC 서명 token을 사용하고 브라우저가 즉시 sessionStorage로 옮긴 뒤 URL에서 제거합니다.

## 배포 전 준비

1. Repair 기본 migration, `0020_repair_notifications.sql`, `0021_repair_tickets_and_notifications.sql`을 운영 D1에 적용합니다.
2. Pages에 `OALUM_DB`, `OALUM_R2`, `ORDER_ADMIN_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REPAIR_NOTIFICATION_CRON_SECRET`을 설정합니다. Ticket 서명은 `REPAIR_TICKET_ACCESS_SECRET`, `AUTH_SECRET`, `ORDER_ADMIN_SECRET` 순으로 사용합니다.
3. Scheduled Worker에도 같은 `REPAIR_NOTIFICATION_CRON_SECRET`을 secret으로 설정합니다.
4. SOLAPI 운영 전 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`, `SOLAPI_TEST_PHONE`을 Pages secret으로 설정하고 `SMS_ENABLED=true`, `SMS_DRY_RUN=false`로 전환합니다.
5. `npm run cf:repair-notifications:deploy`로 5분 cron Worker를 배포합니다.
6. `repair.html`, `repair-admin.html`, `repair-ticket.html`, `notification-admin.html`, `account.html`을 확인합니다.

사진이 필수인 Repair 접수에서 `OALUM_R2`가 없으면 의도적으로 `503`을 반환합니다.