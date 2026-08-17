# Repair Studio

## 역할 분리

- `repair.html`: 고객 수선 접수 화면. `POST /api/repairs`에 multipart 형식으로 성함, 연락처, 제품 설명, 선택 기한과 선택 사진을 보냅니다.
- `repair-admin.html`: 관리자 인증 후 접수 상태, 견적, 고객 안내 문구, 내부 메모를 관리합니다.
- D1: 요청 메타데이터와 사진의 R2 key만 저장합니다.
- R2: 새 원본 사진을 `repair-requests/<request-id>/...`로 저장합니다. 기존 `repairs/` 객체도 계속 비공개로 취급하며 공개 CDN 또는 공개 이미지 URL로 사용하지 않습니다.
- 이메일: 로그인 회원은 계정 이메일을 사용하고 비회원은 이메일을 입력합니다. 접수 후 Resend로 `studio.oalum@gmail.com`과 신청자에게 각각 접수 안내를 보냅니다. 메일 발송 실패는 이미 저장된 접수를 취소하지 않습니다.
- 작업 이미지 기록 활용: 개인정보 수집 동의 바로 위에서 선택 동의를 받습니다. 선택한 요청만 `archive_consent_at`을 기록하며, 완료 후 Archive 기록 후보로 표시됩니다.

## 보안 경계

1. 공개 접수 API는 이미지 key나 URL을 응답하지 않습니다.
2. 일반 `/api/r2?key=...` 경로는 `repair-requests/`와 기존 `repairs/` 접두사를 모두 404로 처리합니다.
3. 원본 이미지는 `/api/repairs/images/:id`에서만 읽고, `ORDER_ADMIN_SECRET` 기반의 짧은 bearer 세션을 요구합니다.
4. 관리자 목록 API는 R2 key 대신 인증된 이미지 스트림 경로만 제공합니다.
5. 이미지 응답은 `Cache-Control: private, no-store`를 사용합니다.

## 배포 전 준비

1. `cloudflare/d1/migrations/0013_repair_requests.sql`을 운영 D1에 적용합니다.
2. Pages/Worker에 `OALUM_DB`, `OALUM_R2`, `ORDER_ADMIN_SECRET`을 설정합니다.
3. `repair.html`에서 실제 접수, `repair-admin.html`에서 상태 변경과 원본 이미지 조회를 확인합니다.

사진이 포함된 요청에서 `OALUM_R2`가 없으면 Repair 접수는 의도적으로 `503`을 반환합니다. 사진이 없는 요청은 D1에 정상 접수됩니다.