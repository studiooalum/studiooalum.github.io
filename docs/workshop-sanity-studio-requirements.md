# Workshop Sanity Studio Requirements

이 문서는 워크숍 상세/예약 기능을 위한 Sanity 편집면 작업을 나중에 진행할 때 필요한 범위를 정리한 문서다.

## 현재 상태

- 현재 storefront와 예약 API는 워크숍 문서에서 아래 필드가 오면 그대로 사용한다.
- 이 저장소에는 실제 Studio 앱이나 schema 정의가 없다.
- 따라서 지금은 public query + fallback 데이터로 동작하고 있다.

## 필요한 저장소/환경

- Sanity Studio가 들어있는 별도 저장소 또는 이 저장소 안의 apps/studio 추가
- 현재 사용 중인 Sanity projectId, dataset 연결
- preview / production 환경 분리 여부 결정
- 편집 권한 사용자 역할 정의

## Workshop Document Schema

워크숍 문서 타입은 최소한 아래 필드를 편집 가능해야 한다.

- title
- slug
- category 또는 workshopCategory
- summary
- description
- duration 또는 durationLabel
- levelLabel
- audienceLabel
- maxCapacity
- capacityLabel
- price
- bookingNotice
- hostName
- locationName
- locationAddress
- locationDetail
- materials 배열
- thingsToBring 배열
- poster
- posterImage
- mainImage
- images 배열

## Schedule Slot Schema

예약 가능 일정은 배열 오브젝트로 관리하는 편이 현재 storefront/API와 가장 잘 맞는다.

- _key
- label
- date
- startTime
- endTime
- capacity
- isBlocked
- status
- reason

권장 규칙:

- date는 YYYY-MM-DD
- startTime / endTime은 HH:MM 24시간 형식
- capacity는 양의 정수
- blocked 일정은 reason 입력 권장
- 같은 workshop 문서 안에서 date + startTime 조합 중복 방지

## 편집 UX 요구사항

단순 필드 입력만으로는 운영이 불편하므로 Studio 편집면은 아래 보조 UX가 있으면 좋다.

- 월별 일정 목록 정렬
- blocked date 빠른 토글
- 주말/휴무일 일괄 차단 템플릿
- sold out 표시를 위한 capacity 0 또는 blocked preset
- location / materials / bring 항목의 반복 입력 UI
- poster 대표 이미지와 상세 이미지 분리

## 검증 요구사항

Studio schema 또는 custom validation에서 아래를 검사해야 한다.

- slug 필수
- title 필수
- 일정이 있으면 date/startTime 필수
- capacity가 있으면 1 이상
- blocked 일정은 reason 권장
- 예약 가능한 slot은 과거 날짜 등록 방지 여부 검토

## storefront / API 연동 기준

현재 구현은 아래 필드를 이미 소비한다.

- 목록: title, slug, category, summary, durationLabel, levelLabel, locationName, poster
- 상세: description, materials, thingsToBring, maxCapacity, locationName, locationAddress, locationDetail, price, bookingNotice, scheduleSlots
- 예약 API: slug와 scheduleSlots를 기준으로 slotKey 검증

즉 Studio 작업은 기존 API contract를 유지하는 방향으로 맞추는 것이 가장 안전하다.

## 이후 작업 순서 제안

1. Studio 저장소 위치 확정
2. workshop / scheduleSlots schema 추가
3. validation 및 editor-friendly input 추가
4. 기존 workshop 문서 backfill
5. preview와 production에서 목록/상세/예약 검수
6. 필요 시 blocked date 일괄 편집용 custom input 추가