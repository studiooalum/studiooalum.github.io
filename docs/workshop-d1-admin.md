# Workshop D1 Admin Notes

현재 Workshop 운영은 Sanity 편집면 대신 D1 + 자체 admin page 기준으로 이동한다.

## 목표

- 공개 워크숍 목록/상세를 D1 콘텐츠 기준으로 운영한다.
- 예약 데이터와 콘텐츠 데이터를 같은 Cloudflare 경계에서 관리한다.
- 포스터/후기 이미지는 우선 URL 또는 R2 key 메타를 저장하고, 추후 R2 업로드 바인딩을 붙여도 스키마를 다시 바꾸지 않도록 한다.

## 현재 저장 구조

### D1 tables

- `workshops`: 워크숍 콘텐츠 본문, 메타, 포스터, 갤러리, 회차 JSON, 공개 상태
- `workshop_reservations`: 예약자 정보와 예약 회차 스냅샷
- `workshop_schedule_blocks`: 날짜 단위 예약 차단

### Public/API paths

- `functions/api/workshops/catalog`: 공개 워크숍 목록
- `functions/api/workshops/availability`: 상세 + 예약 가능 상태
- `functions/api/workshops/reservations`: 예약 생성
- `functions/api/workshops/admin`: 예약/차단/콘텐츠 관리

### Admin surface

- `workshop-admin.html`
- `runtime/storefront/scripts/workshop-admin.js`

## 이미지 전략

초기에는 아래 필드를 함께 유지한다.

- `poster_image_url`
- `poster_image_r2_key`
- `gallery_images_json[].url`
- `gallery_images_json[].r2Key`

즉, 지금은 정적 URL이나 외부 URL로도 운영할 수 있고, 나중에 R2 바인딩을 붙이면 같은 레코드에 object key를 저장해 업로드 흐름만 추가하면 된다.

## R2 연결

- Wrangler 바인딩 이름: `OALUM_R2`
- 버킷 이름: `oalum-db`
- 업로드 API: `POST /api/workshops/admin` with multipart form-data and `action=uploadWorkshopImage`
- 이미지 조회 API: `GET /api/r2?key=...`

## 운영 원칙

- Shop과 Archive는 Sanity 유지
- Workshop은 D1 + admin 우선
- Newsletter도 같은 방향으로 정리 가능

## 마이그레이션 메모

- 신규 D1 마이그레이션: `cloudflare/d1/migrations/0009_workshop_content.sql`
- 기존 워크숍 공개면은 D1 published 레코드를 우선 읽고, 없으면 Sanity/fallback으로 내려간다.
- 따라서 초기 데이터 이전은 한 번에 모두 하지 않아도 되고, D1에 저장한 워크숍부터 순차적으로 공개 전환할 수 있다.