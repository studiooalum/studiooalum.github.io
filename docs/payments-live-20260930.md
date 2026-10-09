# Shop / Workshop 결제 라이브 점검 · 2026-10-01

## 배포와 현재 상태

- 운영 사이트: https://studiooalum.com
- 최종 배포: https://61608a5b.studiooalum.pages.dev (Cloudflare Pages `studiooalum`, production branch `main`).
- 코드·DB 알림 템플릿과 실제 라이브 키 적용 완료. 라이브 결제위젯 표시 정상. 퀵오픈 MID `q_studiocsfb`로 운영 연결을 통일했다.
- 최종 운영 `/api/payments/config` 응답: HTTP 200, `ok: true`, `mode: "live"`. 사용자가 두 키의 실제 값을 재저장한 후 2026-10-01 재배포에서 반영됐다. 이전 배포의 키 누락 오류는 해소됐다. 서버 시크릿 실제 값은 조회하거나 기록하지 않았다.
- 사용자가 `TOSS_API_KEY` / `TOSS_API_SECRET`을 `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY`로 변경했다고 확인했으므로 기존 정식 이름을 유지한다.
- 실제 결제, 실제 환불 및 고객 대상 테스트 알림은 실행하지 않았다.

## 변경 내용

1. Shop 성공 리다이렉트에서 금액을 숫자로 변환하여 실제 승인 API 검증 규격에 맞춘다. 기존 문자열 전송은 승인이 거절될 수 있었다.
2. Shop 결제 인증 후 추가 승인 버튼 없이 서버 승인 절차를 자동 시작한다. 네트워크 실패를 성공으로 표시하던 프리뷰 우회 코드를 제거했다.
3. 키의 클라이언트/서버 종류를 검사한다. 시크릿 키를 클라이언트 설정에 잘못 넣어도 공개 API로 반환하지 않는다.
4. 주문서형 `live_gck_` 키는 위젯, API 개별 연동 `live_ck_` 키는 카드·간편결제 통합결제창으로 연동한다. Workshop도 운영 variantKey 설정을 사용한다.
5. Workshop 취소 웹훅은 검증된 결제 내역을 바로 저장한다. 취소 API를 다시 호출하지 않으며, 승인 결과를 저장하기 전에 이미 취소된 결제도 처리한다.
6. Shop 웹훅에서 결제 이벤트 저장 후 알림 저장이 실패하면 오류를 반환해 Toss 재시도를 유도한다. 중복 이벤트라도 알림 저장을 재시도하고, 기존 outbox의 고유 키로 중복 발송을 방지한다.
7. 결제 조회 제한시간을 웹훅 경로에서는 6초로 제한한다. Toss의 10초 응답 기준을 고려했다.
8. Shop 전액 취소 웹훅은 아직 발송 전인 배송 준비 상태도 취소한다. 이미 발송된 배송 이력은 보존한다.
9. 부분 취소는 전액 환불로 표시하지 않는다. 검증된 원본을 결제 이벤트에 기록하고 관리자에게 주문/인원/쿠폰/적립금 검토 이메일을 대기열에 넣는다. 잔여 금액별 이벤트 키로 재전송을 중복 처리하지 않는다.
10. Workshop 처리 중 결제 정기 조회에서 주문·금액·키를 검증하고, 이미 취소된 결제를 동기화한다. 만료/거절된 결제는 이전 키를 해제하여 재시도할 수 있게 한다.

## 운영 DB·관리자·알림 확인

- D1 `oalum-orders`: `PRAGMA quick_check = ok`, 외래키 위반 없음. 변경 후 재검사 정상.
- 기존 주문 6건(생성 3 / 결제 완료 3), Workshop 결제 주문 0건의 개수를 유지했다.
- 결제 승인/취소/예약 보호용 기존 DB 구조 및 트리거 확인.
- 새 마이그레이션 `0042_payment_review_notification.sql`만 운영에 적용했다. 기존 거래 및 기존 알림 템플릿은 변경하지 않았다.
- 마이그레이션 직전 DB 전체 백업: `.wrangler/backups/pre-payment-live-20260930.sql` (비공개, git 제외).
- `Shop`, `Workshop`, `Notification` 관리자 API가 인증 없이 모두 401을 반환한다.
- 결제·환불·예약확정 이메일 템플릿은 활성. Shop/Workshop 추가 SMS는 기존 정책대로 비활성.
- 기존 알림 발송 이력 57건은 모두 `sent`, 대기/실패 없음.
- `studiooalum-repair-notifications` 5분 간격 정기 작업의 최근 실행 로그가 `outcome: ok`. 프로세서 결과에 실패/미확인/최종 실패 없음.
- 배포 전부터 있던 수선 관련 로컬 변경(미들웨어, 테스트, 0041)은 보존했다. 0041을 이번 작업에서 운영에 다시 적용하지 않았다.

## 웹훅 등록

Toss 개발자센터의 실제 운영 MID에서 다음을 등록한다.

- 이름: Studio OALUM 결제 상태 동기화
- URL: https://studiooalum.com/api/webhooks/toss
- 이벤트: `PAYMENT_STATUS_CHANGED`
- 처리: Toss API 재조회 → 주문번호·금액·통화·결제 키 검사 → 상태/기록/알림 반영.

서버 수신 코드와 운영 URL은 배포되어 있다.

- 운영 상점: 1651236. 기본 개발자센터에 선택되어 있던 1651276은 테스트 전용 상점이었다.
- 기존 `Oalum Webhook`은 홈페이지 루트 주소로 등록되어 POST 405를 반환했고 전송 이력이 없었다. 사용자에게 명시적 삭제 승인을 받은 뒤 삭제 완료를 확인했다.
- 미리오픈 MID `q_studiocsfb` (account 2587011): 사용자 재로그인 후 라이브 목록에서 `Studio OALUM 결제 상태 동기화`, URL `https://studiooalum.com/api/webhooks/toss`, 이벤트 `PAYMENT_STATUS_CHANGED`가 저장된 것을 확인했다. 추가 등록 없이 기존 성공 결과를 확인했다.
- 추가 검증: 중복 알림 복구·Workshop 중복 취소 방지·위조 웹훅 방어 테스트 3개 재실행 통과.


`CANCEL_STATUS_CHANGED`는 비동기 해외 간편결제용이므로 현재 국내 카드/즉시결제 구성에는 등록하지 않는다. 가상계좌는 입금 기한·자리 보류·환불계좌 운영이 별도로 필요하므로 현재 프런트에서 발급 전 차단한다. 운영 결제위젯에서도 가상계좌를 비활성으로 설정하는 것이 맞다. 가상계좌 발급을 결제 완료로 처리하지 않는다.

부분 환불은 관리자 확인 대상이며 품목별 부분 취소 UI나 인원/쿠폰/적립금 자동 조정은 이번 범위에 포함하지 않는다.

## 검증 결과

- `npm run verify`: 테스트 138개 통과, 실패 0. 정적 사이트 빌드 성공.
- 테스트 대상: 서버 금액 검증, 동시 결제 키 경합, 중복 승인 재조회, 전액 취소 금액 검증, 키 혼용/시크릿 노출 방지, 자동 승인 프런트와 실제 API 계약, 실패 시 장바구니 유지, SDK별 연결, 가상계좌 발급 차단, 웹훅 위조 금액, 중복/실패 알림 복구, Workshop 취소 동기화, 부분 취소 관리자 알림.
- 배포 후 운영 안전 점검 7개 통과: health 200, 관리자 API 세 종류 401, 잘못된 웹훅 400, 무관한 이벤트 200, 외부 출처 승인 요청 403.
- 실제 Shop 상품 목록이 브라우저에서 로드되는 것을 확인했다.
- 실제 운영 설정과 배포된 공용 결제 헬퍼를 사용한 브라우저 검사에서 라이브 SDK 결제수단·필수약관 표시 정상. 주문 생성·결제 요청 없이 확인했다.
- 최종 운영 health 200, config 200/live, 관리자 API 세 종류 401 재확인.
- 미검증: 실제 승인/환불 및 Toss에서 전송한 웹훅 수신. 실거래를 수행하지 않았으므로 운영 시크릿의 승인 API 인증과 두 키의 동일 상점 여부까지 입증한 것은 아니다.

## 남은 검증

1. 퀵오픈 MID `q_studiocsfb`의 라이브 웹훅 등록은 완료했다. MID 변경 후 실제 승인과 웹훅 상태 동기화는 사용자 재결제로 확인한다.
2. 실제 카드 결제/환불은 사용자와 금액·거래 대상을 정한 뒤 검증한다. 현재 테스트는 실제 금전 이동을 포함하지 않는다.

## 공식 참고 문서

- [Toss API 키](https://docs.tosspayments.com/reference/using-api/api-keys)
- [Toss 카드·간편결제 통합결제창](https://docs.tosspayments.com/guides/v2/payment-window/integration)
- [Toss 주문서형 SDK](https://docs.tosspayments.com/sdk/v2/js/payment-widget)
- [Toss 웹훅 연결 및 재전송 정책](https://docs.tosspayments.com/guides/v2/webhook)
- [Toss 웹훅 이벤트](https://docs.tosspayments.com/reference/using-api/webhook-events)

## 2026-10-01 퀵오픈 상점 연결 수정

- 기존 DEFAULT 결제위젯이 사용하지 않는 과거 신청 상점에 연결되어 승인 거절이 발생했다.
- 토스 결제 UI 설정에서 DEFAULT의 국내 일반결제 MID를 `q_studiocsfb`로 변경하고 저장된 목록을 확인했다.
- Shop·Workshop은 공통 위젯 DEFAULT를 사용하므로 함께 적용된다. 키 변경이나 코드 재배포는 필요하지 않다.
- 코드와 Cloudflare 공개 환경설정에는 과거 MID 직접 참조가 없었다. 로컬 점검 문서의 과거 MID 문자열을 제거했다.
- 운영 payments 원문, payment_events payload, workshop_payment_orders 원문에서 과거 MID 일치 기록은 각각 0건이었다.
- 토스 상점 신청 자체의 취소 및 토스 보관 API 기록 삭제는 완료한 작업이 아니다.

- 사용하지 않는 과거 신청 상점의 라이브 웹훅 삭제 후 빈 목록 확인 완료. 퀵오픈 웹훅은 유지했다.
