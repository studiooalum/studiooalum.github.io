# Root Storefront Layout Rules

## Scope

- 이 문서는 루트 HTML 페이지와 `runtime/storefront/*`에 적용하는 기본 레이아웃 규칙이다.
- 대상 페이지는 `index.html`, `shop.html`, `product.html`, `edition.html`, `workshop.html`, `account.html`, `signup.html` 같은 공개 루트 storefront 셸이다.

## Desktop Shell Rule

- 데스크톱 기준점은 항상 3열이다.
- 기준 브레이크포인트는 `min-width: 960px` 이다.
- 시작점은 `grid-template-columns: repeat(3, minmax(0, 1fr))` 이다.
- 페이지 성격에 따라 1열 단독, 1-2열 확장, 3열 rail 구성을 쓸 수 있지만 3열 기준 자체를 바꾸지 않는다.

## Placement Rule

- 콘텐츠 + rail 구조는 1-2열을 본문, 3열을 보조 정보로 사용한다.
- 유틸리티 페이지도 같은 3열 좌표계 안에서 배치한다.
- 새 유틸리티 페이지를 만들 때는 별도 2열 셸이나 임의 중심 정렬 레이아웃을 추가하지 않는다.

현재 합의된 account 계열 배치는 아래와 같다.

- `account.html`: 로그인 1열, 비회원 주문확인 2열, 나머지 공간은 비워둔다.
- `signup.html`: 회원가입 폼은 1열에 둔다.
- `forgot-password.html`: 비밀번호 찾기 폼은 1열에 둔다.
- 로그인 후 계정 화면은 3열 grid를 유지한다.
- 모바일 `account.html` 비로그인 화면은 상단 탭으로 로그인 / 비회원 주문을 전환하고, 본문에는 선택된 섹션만 노출한다.
- `signup.html`과 `forgot-password.html`은 추가 박스 없이 선과 여백만으로 정리한다.

## Visual Rule

- 루트 storefront 유틸리티 페이지는 기본적으로 흰 배경과 검은 선, 기존 타이포만 사용한다.
- 페이지 전체를 감싸는 색 박스, 베이지 카드, 임의 패널 배경은 기본 규칙으로 두지 않는다.
- 강조가 필요하면 면 색 대신 배치, 여백, 선, 버튼 위계로 해결한다.
- 기본 버튼 위계는 검은 채움 1차 버튼, 선만 있는 2차 버튼이다.
- 입력창은 단색 배경과 단순 border를 유지한다.

## Reference Files

- 기본 spacing과 shell: `runtime/storefront/styles/layout.css`
- 3열 content + rail 예시: `runtime/storefront/styles/shop.css`
- 3열 페이지 리듬 예시: `runtime/storefront/styles/product.css`
- 유틸리티/placeholder 배치 예시: `runtime/storefront/styles/placeholder-page.css`

## Change Rule

- 루트 storefront 레이아웃을 수정할 때는 먼저 이 문서와 reference files를 확인한다.
- 3열 규칙에서 벗어나는 예외가 필요하면, 코드 변경과 함께 이 문서에 예외 이유와 적용 페이지를 같이 남긴다.