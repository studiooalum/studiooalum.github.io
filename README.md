# Studio OALUM Repository

현재 공개 중인 루트 정적 storefront와 GitHub Pages 정적 배포를 유지하면서, 인증·주문·결제 같은 서버 기능은 Cloudflare 런타임으로 보강한 상태에서 정식 오픈용 구조로 넘어가기 쉽게 저장소를 재정리한 상태입니다.

## What Stays Live

- 루트의 `index.html`, `shop.html`, `product.html` 등은 계속 공개 진입점으로 사용합니다.
- 루트 페이지 대부분은 `runtime/storefront/styles`와 `runtime/storefront/scripts`를 공유 런타임으로 사용합니다.
- `styles/`와 `scripts/`는 루트의 초기 마케팅 페이지(`index.html`)에 남아 있습니다.

즉, 현재 GitHub Pages 정적 배포를 깨지 않기 위해 루트 HTML과 `runtime/storefront/` 라이브 자산을 유지합니다.

## Repository Layout

```txt
.
├─ index.html, shop.html, ...  # 현재 공개 중인 정적 진입점
├─ styles/                     # 루트 초기 페이지용 스타일
├─ scripts/                    # 루트 초기 페이지용 스크립트
├─ public/                     # 폰트/이미지 등 정적 자산
├─ runtime/
│  └─ storefront/              # 현재 공개 페이지가 공유하는 스타일/스크립트 런타임
├─ functions/                  # Cloudflare Pages Functions API
├─ cloudflare/
│  └─ d1/                      # D1 schema와 migrations
├─ apps/
│  └─ web/                     # 정식 오픈용 Next.js storefront 스캐폴드
├─ archive/
│  ├─ legacy/                  # 더 이상 루트 사이트가 직접 사용하지 않는 이전 HTML 셸 보관
│  └─ README.md
└─ docs/
   └─ architecture.md
```

## Commands

```bash
npm run site:serve
npm run cf:build
npm run cf:pages:dev
npm run web:dev
```

- `site:serve`: 현재 루트 정적 storefront를 로컬에서 정적으로 확인합니다.
- `cf:build`: Cloudflare Pages 배포용 `dist/` 정적 출력물을 생성합니다.
- `cf:pages:dev`: Cloudflare Pages + Functions 기준으로 로컬 개발 서버를 실행합니다.
- `web:dev`: `apps/web` 아래 Next.js storefront 스캐폴드를 실행합니다.

## Deployment Reality

- 현재 GitHub 저장소에는 `main` 푸시 시 자동으로 도는 `pages-build-deployment`가 연결되어 있습니다. 정적 루트 페이지 변경만 배포할 때는 GitHub에 push하면 반영됩니다.
- 도메인이 Cloudflare를 거치더라도, 이 경로는 우선 GitHub Pages 정적 배포를 기준으로 이해하는 편이 맞습니다.
- `wrangler pages deploy`는 이 정적 자동배포 경로를 대체하는 기본 명령이 아닙니다.
- 반대로 `functions/api/*`, D1, 세션 쿠키, OAuth callback 같은 서버 기능은 GitHub Pages만으로는 동작하지 않습니다. 이 기능들은 Cloudflare Pages 또는 Workers 런타임이 실제로 연결되어 있어야 합니다.
- 원격 dev container나 Codespaces에서는 브라우저 기반 `wrangler login`을 쓰지 않습니다. Cloudflare 인증 callback이 localhost로 떨어져 실패할 수 있으므로, 필요하면 Cloudflare Dashboard의 GitHub 연동이나 API token 경로만 사용합니다.

## Auth Notes

- 현재 로그인은 루트 공개 스토어 기준으로 `account.html` + `functions/api/auth/*` + `cloudflare/d1/schema.sql` 조합으로 동작합니다.
- 현재 루트 스토어프론트 UI는 이메일 + 비밀번호 직접가입/로그인만 노출합니다. 로그인 과정에 별도 이메일 인증은 요구하지 않습니다.
- 회원가입 시 이름, 이메일, 비밀번호와 함께 개인정보 처리방침 동의, 이용약관 동의, 마케팅 수신 동의를 저장합니다.
- OAuth 백엔드 스캐폴딩은 남아 있지만 현재 루트 UI에서는 소셜 로그인 버튼을 노출하지 않습니다.
- 로컬에서 인증 흐름까지 확인하려면 정적 서버가 아니라 `npm run cf:pages:dev`로 실행해야 합니다.
- 배포 전에는 D1에 최신 `cloudflare/d1/schema.sql`을 반영해야 합니다.
- 기존 D1을 쓰고 있다면 `cloudflare/d1/migrations/0002_auth_oauth.sql` 다음 `cloudflare/d1/migrations/0003_password_auth.sql` 순서로 적용해야 합니다.

필수 또는 권장 환경 변수:

- `OALUM_DB`: Cloudflare Pages D1 binding
- `AUTH_SECRET`: 세션 및 비밀번호 기반 인증 해시에 쓰는 시크릿 문자열 권장
- `AUTH_COOKIE_INSECURE=true`: 로컬 HTTP 개발 환경에서만 필요할 수 있음
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: 비밀번호 찾기 이메일 인증과 기존 이메일 코드 플로우에 필요
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`: 카카오 로그인 재활성화 시 필요
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`: 네이버 로그인 재활성화 시 필요
- `NAVER_SITE_VERIFICATION`: 네이버 Search Advisor 메타 검증 토큰. 설정하면 `npm run cf:build` 시 `dist/index.html` head에 `naver-site-verification` 메타를 주입
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: 구글 로그인 재활성화 시 필요
- `AUTH_BASE_URL`: OAuth callback 절대 URL을 고정해야 할 때만 사용
- `AUTH_DEBUG=true`: 기존 이메일 코드 인증 플로우를 로컬에서 디버깅할 때만 사용

기존 D1에 마이그레이션을 적용할 때는 아래처럼 실행합니다.

```bash
npx wrangler d1 execute oalum-orders --file=./cloudflare/d1/migrations/0002_auth_oauth.sql
npx wrangler d1 execute oalum-orders --file=./cloudflare/d1/migrations/0003_password_auth.sql
```

OAuth 제공자에 등록할 callback URL 패턴은 소셜 로그인을 다시 켤 때만 필요합니다.

- 카카오: `/api/auth/oauth/callback?provider=kakao`
- 네이버: `/api/auth/oauth/callback?provider=naver`
- 구글: `/api/auth/oauth/callback?provider=google`

예를 들어 운영 도메인이 `https://studiooalum.com` 이면 카카오 callback URL은 `https://studiooalum.com/api/auth/oauth/callback?provider=kakao` 입니다.

네이버 소유 확인 메타를 실제 공개 홈에 반영하는 방식은 현재 배포 경로를 기준으로 구분해서 봐야 합니다.

- 현재 공개 사이트는 GitHub Pages가 루트 `index.html` 을 그대로 배포하므로, 네이버 검증 메타를 라이브에 올리려면 발급된 값을 루트 [index.html](/workspaces/studiooalum.github.io/index.html) 에 직접 넣고 push 해야 합니다.
- 반대로 `NAVER_SITE_VERIFICATION` 환경변수 주입은 `npm run cf:build` 로 만드는 `dist/` 출력이나 Cloudflare Pages 전환 경로에서만 바로 반영됩니다.

## Working Rules

- 현재 공개 사이트를 수정할 때는 루트 HTML과 `runtime/storefront` 자산을 먼저 봅니다.
- `apps/web`는 정식 오픈용 Next.js storefront 스캐폴드입니다. 아직 루트 정적 storefront를 대체하지 않습니다.
- Sanity Studio가 필요하면 별도 저장소 또는 비추적 로컬 경로로 두는 전제를 유지합니다.
- `runtime/storefront/`는 현재 공개 중인 루트 정적 셸이 직접 읽는 라이브 런타임입니다.
- `archive/legacy/`는 더 이상 루트 사이트가 직접 사용하지 않는 이전 HTML 셸을 보관합니다.

## Planning Docs

- `docs/architecture.md`: 현재 저장소 경계와 운영 방향
- `docs/cloudflare-low-cost-stack.md`: 디자인을 유지하는 최저비용 운영 구조
- `docs/cloudflare-traffic-hygiene.md`: Cloudflare 봇 필터링, WAF, Web Analytics 운영 기준
- `docs/gabia-cloudflare-domain-setup.md`: 가비아 도메인과 Cloudflare 연결 절차
- `docs/cloudflare-pages-transition.md`: Cloudflare Pages 전환용 실제 스캐폴드와 명령어
- `docs/seo-optimization-plan.md`: 정적 사이트 기준 SEO 우선순위와 실행 계획
- `docs/apps-web-deploy.md`: `apps/web` 기반 확장 경로
- `docs/commerce-schema.sql`: 주문/결제 스키마 초안

## Next Step

- 저트래픽 운영을 먼저 열려면 `docs/cloudflare-low-cost-stack.md` 경로를 따르고,
- 더 큰 앱 구조로 확장하려면 `apps/web` 중심 경로로 이동하고,
- 주문/결제/웹훅은 어느 경로든 서버 API로 옮겨야 합니다.

자세한 경계와 마이그레이션 기준은 `docs/architecture.md`를 참고하세요.
