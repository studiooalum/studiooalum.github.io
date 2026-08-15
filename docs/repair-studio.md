# Repair Studio

## 역할 분리

- `repair.html`: 고객 수선 접수 화면. `POST /api/repairs`에 multipart 형식으로 이름, 연락처, 작업 정보와 사진을 보냅니다.
- `repair-admin.html`: 관리자 인증 후 접수 상태, 견적, 고객 안내 문구, 내부 메모를 관리합니다.
- D1: 요청 메타데이터와 사진의 R2 key만 저장합니다.
- R2: 원본 사진을 `repairs/<request-id>/...`로 저장합니다. 공개 CDN 또는 공개 이미지 URL로 사용하지 않습니다.

## 보안 경계

1. 공개 접수 API는 이미지 key나 URL을 응답하지 않습니다.
2. 일반 `/api/r2?key=...` 경로는 `repairs/` 접두사를 404로 처리합니다.
3. 원본 이미지는 `/api/repairs/images/:id`에서만 읽고, `ORDER_ADMIN_SECRET` 기반의 짧은 bearer 세션을 요구합니다.
4. 관리자 목록 API는 R2 key 대신 인증된 이미지 스트림 경로만 제공합니다.
5. 이미지 응답은 `Cache-Control: private, no-store`를 사용합니다.

## 배포 전 준비

1. `cloudflare/d1/migrations/0013_repair_requests.sql`을 운영 D1에 적용합니다.
2. Pages/Worker에 `OALUM_DB`, `OALUM_R2`, `ORDER_ADMIN_SECRET`을 설정합니다.
3. `repair.html`에서 실제 접수, `repair-admin.html`에서 상태 변경과 원본 이미지 조회를 확인합니다.

`OALUM_R2`가 없으면 Repair 접수는 의도적으로 `503`을 반환합니다. 접수 사진이 저장되지 않은 요청을 만들지 않기 위한 동작입니다.