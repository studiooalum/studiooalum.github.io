# Cloudflare Traffic Hygiene

Cloudflare의 총 요청 수는 실제 사용자 트래픽과 동일하지 않다. 정적 사이트는 취약점 스캐너, 링크 프리뷰 봇, 무작위 크롤러가 계속 섞이므로 보안 지표와 사용자 지표를 분리해서 봐야 한다.

이 저장소는 아래 두 가지를 이미 반영했다.

- 루트의 [_routes.json](/workspaces/studiooalum.github.io/_routes.json) 으로 Pages Functions 실행 범위를 /api/* 로 제한
- 루트의 [_headers](/workspaces/studiooalum.github.io/_headers), [robots.txt](/workspaces/studiooalum.github.io/robots.txt) 로 noindex, no-store, 기본 보안 헤더 적용

## Recommended Dashboard Setup

### 0. Canonical Host Redirect

SEO 기준 도메인은 `https://studiooalum.com` 으로 고정하고 `https://www.studiooalum.com` 은 항상 apex 로 301 redirect 한다.

이 저장소 안에는 현재 `www -> apex` 를 강제하는 실행 코드가 없고, 실제 공개 라우팅은 Cloudflare에서 처리되는 상태다. 따라서 이 설정은 Cloudflare Dashboard에서 유지하는 편이 맞다.

#### Redirect Rule

- Dashboard: Rules > Redirect Rules
- Rule name: `www-to-apex`
- If incoming requests match:

```txt
Hostname equals www.studiooalum.com
```

- Then:

```txt
Dynamic Redirect
Expression: concat("https://studiooalum.com", http.request.uri.path)
Preserve query string: on
Status code: 301
```

경로와 쿼리스트링을 그대로 보존해야 `/shop`, `/workshop?slug=...` 같은 공개 URL canonical 과 충돌하지 않는다.

#### Verification

설정 후 아래 두 가지를 같이 확인한다.

```bash
curl -I https://www.studiooalum.com/
curl -I "https://www.studiooalum.com/workshop?slug=test"
```

기대 결과는 아래와 같다.

- 첫 요청: `301` 과 `Location: https://studiooalum.com/`
- 둘째 요청: `301` 과 `Location: https://studiooalum.com/workshop?slug=test`

그 다음 공개 페이지의 canonical 도 redirect 대상과 일치해야 한다. 현재 SEO 메타데이터는 모두 apex 기준으로 맞추는 것을 전제로 유지한다.

### 1. Enable Bot Fight Mode

Cloudflare Dashboard > Security > Bots 에서 Bot Fight Mode를 먼저 켠다.

이 단계는 가장 저비용으로 노이즈를 줄이는 기본선이다. 총 요청 수가 줄지 않더라도 보안 이벤트에서 자동 분류가 늘어나면 메트릭 해석이 쉬워진다.

### 2. Add WAF Custom Rules

아래 규칙은 무료/저비용 운영 기준으로 바로 적용하기 좋다.

#### Rule A. Exploit probe paths

- Action: Block
- Expression:

```txt
lower(http.request.uri.path) contains "/wp-admin"
or lower(http.request.uri.path) contains "/wp-login.php"
or lower(http.request.uri.path) contains "/xmlrpc.php"
or lower(http.request.uri.path) contains "/phpmyadmin"
or lower(http.request.uri.path) contains "/.env"
or lower(http.request.uri.path) contains "/.git"
or lower(http.request.uri.path) contains "/vendor/"
or lower(http.request.uri.path) contains "/cgi-bin/"
or lower(http.request.uri.path) contains "/server-status"
```

#### Rule B. API GET browsing

- Action: Block
- Expression:

```txt
starts_with(http.request.uri.path, "/api/")
and http.request.method eq "GET"
```

현재 API 구현은 POST와 OPTIONS만 처리한다. 기준 파일은 [functions/api/orders.js](/workspaces/studiooalum.github.io/functions/api/orders.js), [functions/api/payments/confirm.js](/workspaces/studiooalum.github.io/functions/api/payments/confirm.js), [functions/api/webhooks/toss.js](/workspaces/studiooalum.github.io/functions/api/webhooks/toss.js) 다.

#### Rule C. API wrong methods

- Action: Block
- Expression:

```txt
starts_with(http.request.uri.path, "/api/")
and not (http.request.method in {"POST" "OPTIONS"})
```

#### Rule D. Legacy archive crawling

- Action: Managed Challenge
- Expression:

```txt
starts_with(http.request.uri.path, "/archive/legacy/")
```

이 경로는 운영 트래픽과 분리해서 보는 편이 좋다.

### 3. Add Rate Limiting Rules

#### POST /api/orders

- Match: path equals /api/orders and method is POST
- Threshold: IP당 1분 10회
- Action: Managed Challenge

#### POST /api/payments/confirm

- Match: path equals /api/payments/confirm and method is POST
- Threshold: IP당 1분 5회
- Action: Managed Challenge 또는 Block

#### POST /api/webhooks/toss

웹훅은 제공사 재시도가 있을 수 있어서 처음부터 강한 rate limit을 권하지 않는다.

- Match: path equals /api/webhooks/toss and method is not POST
- Action: Block

현재 웹훅 구현은 delivery id를 읽어 중복 저장을 방지한다. 관련 코드는 [functions/api/webhooks/toss.js](/workspaces/studiooalum.github.io/functions/api/webhooks/toss.js#L6) 다.

## Cloudflare Web Analytics

사용자 기준 트래픽은 Cloudflare 총 요청 수보다 Web Analytics 페이지뷰와 방문 수를 우선해서 본다.

이 저장소는 빌드 시 CLOUDFLARE_WEB_ANALYTICS_TOKEN 이 있으면 정적 HTML에 beacon 스크립트를 자동 주입한다. 구현은 [scripts/build-pages.mjs](/workspaces/studiooalum.github.io/scripts/build-pages.mjs) 에 있다.

설정 순서는 아래와 같다.

1. Cloudflare Dashboard > Analytics & Logs > Web Analytics 에서 사이트를 만들고 token을 발급받는다.
2. Pages 프로젝트 환경변수에 CLOUDFLARE_WEB_ANALYTICS_TOKEN 을 추가한다.
3. 배포를 다시 돌린다.
4. Web Analytics에서 방문 수와 상위 페이지를 확인한다.

## Recommended KPI Split

- 총 요청 수: 인터넷 전체가 사이트를 두드린 양
- Security Events: 차단 또는 챌린지된 비정상 요청
- Web Analytics Visits: 사람에 가까운 방문 지표
- /shop.html 진입 수: 상품 탐색 수요
- /checkout.html 진입 수: 구매 의도 수요
- /api/orders 성공 수: 실제 주문 생성
- /api/payments/confirm 성공 수: 실제 결제 완료

총 요청 수만 보고 마케팅 성과를 판단하지 않는 편이 안전하다.