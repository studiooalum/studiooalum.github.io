# Studio OALUM Repository

현재 공개 중인 GitHub Pages 사이트를 유지한 채, 정식 오픈용 구조로 넘어가기 쉽게 저장소를 재정리한 상태입니다.

## What Stays Live

- 루트의 `index.html`, `shop.html`, `product.html` 등은 계속 GitHub Pages 진입점으로 사용합니다.
- 루트 페이지 대부분은 `runtime/storefront/styles`와 `runtime/storefront/scripts`를 공유 런타임으로 사용합니다.
- `styles/`와 `scripts/`는 루트의 초기 마케팅 페이지(`index.html`)에 남아 있습니다.

즉, 현재 GitHub Pages 배포를 깨지 않기 위해 루트 HTML과 `runtime/storefront/` 라이브 자산을 유지합니다.

## Repository Layout

```txt
.
├─ index.html, shop.html, ...  # 현재 GitHub Pages에서 노출되는 정적 진입점
├─ styles/                     # 루트 초기 페이지용 스타일
├─ scripts/                    # 루트 초기 페이지용 스크립트
├─ public/                     # 폰트/이미지 등 정적 자산
├─ runtime/
│  └─ storefront/              # 현재 라이브 페이지가 공유하는 스타일/스크립트 런타임
├─ apps/
│  ├─ web/                     # 정식 오픈용 Next.js storefront 스캐폴드
│  └─ studio/                  # 로컬 전용 Sanity Studio repo (gitignored)
├─ archive/
│  ├─ legacy/
│  │  ├─ about.html            # 더 이상 쓰지 않는 루트 소개 페이지
│  │  └─ v1/                   # 이전 HTML 셸과 실험용 구조 보관
│  ├─ local/
│  │  └─ site-prototype/       # 로컬 전용 실험용 repo 아카이브 (gitignored)
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
npm run studio:dev
```

- `site:serve`: 현재 GitHub Pages 루트를 로컬에서 정적으로 확인합니다.
- `cf:build`: Cloudflare Pages 배포용 `dist/` 정적 출력물을 생성합니다.
- `cf:pages:dev`: Cloudflare Pages + Functions 기준으로 로컬 개발 서버를 실행합니다.
- `web:dev`: `apps/web` 아래 Next.js storefront 스캐폴드를 실행합니다.
- `studio:dev`: `apps/studio` 아래 로컬 Sanity Studio를 실행합니다.

## Working Rules

- 현재 공개 사이트를 수정할 때는 루트 HTML과 `runtime/storefront` 자산을 먼저 봅니다.
- `apps/web`는 정식 오픈용 Next.js storefront 스캐폴드입니다. 아직 루트 GitHub Pages를 대체하지 않습니다.
- `apps/studio`와 `archive/local/site-prototype`는 로컬 전용 repo라서 메인 repo에서 추적하지 않습니다.
- `runtime/storefront/`는 현재 GitHub Pages가 직접 읽는 라이브 런타임입니다.
- `archive/legacy/`는 더 이상 루트 사이트가 직접 사용하지 않는 이전 HTML 셸을 보관합니다.

## Planning Docs

- `docs/architecture.md`: 현재 저장소 경계와 운영 방향
- `docs/cloudflare-low-cost-stack.md`: 디자인을 유지하는 최저비용 운영 구조
- `docs/gabia-cloudflare-domain-setup.md`: 가비아 도메인과 Cloudflare 연결 절차
- `docs/cloudflare-pages-transition.md`: Cloudflare Pages 전환용 실제 스캐폴드와 명령어
- `docs/apps-web-deploy.md`: `apps/web` 기반 확장 경로
- `docs/commerce-schema.sql`: 주문/결제 스키마 초안

## Next Step

- 저트래픽 운영을 먼저 열려면 `docs/cloudflare-low-cost-stack.md` 경로를 따르고,
- 더 큰 앱 구조로 확장하려면 `apps/web` 중심 경로로 이동하고,
- 주문/결제/웹훅은 어느 경로든 서버 API로 옮겨야 합니다.

자세한 경계와 마이그레이션 기준은 `docs/architecture.md`를 참고하세요.
