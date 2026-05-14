# SEO Optimization Plan

현재 사이트는 정적 HTML 중심이라 기술 SEO를 빠르게 안정화하기 좋다. 우선순위는 색인 경계 정리, 메타 정리, 구조화 데이터, 페이지 목적별 콘텐츠 보강 순서가 맞다.

## 1. Indexing Boundaries

색인 대상과 비대상을 먼저 명확히 나눈다.

### Index

- 메인 홈
- Shop
- Product 상세
- Edition 상세
- Archive 중 공개 포트폴리오 성격 페이지
- Workshops, Newsletter 중 검색 유입을 받을 의도가 있는 페이지

### Noindex

- Checkout
- Payment
- Success
- Fail
- Account
- /api/*
- archive/legacy/*

현재 noindex 경계는 [_headers](/workspaces/studiooalum.github.io/_headers) 와 [robots.txt](/workspaces/studiooalum.github.io/robots.txt) 기준으로 이미 일부 반영되어 있다.

## 2. Canonical Domain Strategy

가장 먼저 canonical 기준 도메인을 하나로 고정한다.

- apex 또는 www 중 하나만 메인으로 선택
- 나머지는 301 redirect
- Search Console 속성도 canonical 기준으로 등록

도메인이 확정되면 sitemap.xml 과 canonical link를 함께 넣는다.

## 3. Metadata Plan

각 index 대상 페이지에 아래를 갖춘다.

- 고유 title
- 고유 meta description
- canonical URL
- Open Graph title, description, image, url
- Twitter card metadata

권장 길이는 아래 정도다.

- title: 50자 안팎
- meta description: 110자에서 150자 안팎

현재 루트 HTML은 title만 있고 description, canonical, og 메타가 거의 없다. 첫 구현 우선순위는 [index.html](/workspaces/studiooalum.github.io/index.html), [shop.html](/workspaces/studiooalum.github.io/shop.html), [product.html](/workspaces/studiooalum.github.io/product.html), [edition.html](/workspaces/studiooalum.github.io/edition.html), [archive.html](/workspaces/studiooalum.github.io/archive.html) 다.

## 4. Structured Data

JSON-LD를 페이지 유형별로 나눈다.

- Home: Organization, WebSite
- Shop listing: CollectionPage or ItemList
- Product: Product, Offer
- Edition: Product or VisualArtwork 성격에 맞는 스키마 선택
- Breadcrumb가 있는 페이지: BreadcrumbList

상품 가격, 재고, 대표 이미지, slug, canonical URL이 안정화되면 Product 스키마부터 먼저 넣는 편이 가장 효과적이다.

## 5. Information Architecture

검색 유입을 원하면 탐색 가능한 정적 랜딩 페이지가 더 필요하다.

- 소재별 페이지
- 카테고리별 페이지
- 에디션 소개 페이지
- 작가/브랜드 스토리 페이지
- 배송/교환/관리 가이드 페이지

검색엔진은 결제 흐름보다 설명 가능한 콘텐츠 페이지를 더 잘 평가한다.

## 6. Content Direction

브랜드 검색과 비브랜드 검색을 나눠서 콘텐츠를 잡는다.

### Brand intent

- Studio OALUM
- OALUM rug
- 브랜드/작가/아카이브 소개

### Non-brand intent

- 핸드메이드 러그
- 아트 러그
- 에디션 텍스타일 오브제
- 공간 스타일링 러그

상품 페이지에는 제품 설명 외에 아래 정보를 넣는 편이 좋다.

- 소재와 제작 방식
- 크기와 관리 방법
- 제작/배송 리드타임
- 공간 연출 컷과 사용 맥락
- 에디션 수량과 작품성 설명

## 7. Performance And Crawl Efficiency

- 대표 이미지 용량 최적화 및 실제 표시 크기 기준 제공
- 폰트 수와 초기 로드 폰트 용량 점검
- 메인 페이지 GSAP 로딩이 렌더를 과도하게 막지 않도록 점검
- 중요 페이지는 내부 링크를 더 명확히 연결
- 404, 중복 URL, 파라미터 URL을 최소화

특히 홈의 시각 효과가 강한 편이라 LCP와 INP를 한 번 측정해보는 것이 좋다.

## 8. Measurement Stack

- Google Search Console 등록
- Bing Webmaster 등록
- Cloudflare Web Analytics 연결
- 상품 클릭, 체크아웃 진입, 결제 완료를 별도 이벤트로 수집

SEO는 유입만 보면 안 되고, 검색 유입이 실제 탐색과 구매로 이어지는지 같이 봐야 한다.

## 9. Recommended Rollout Order

1. canonical 도메인 확정과 redirect 정리
2. sitemap.xml 생성
3. 핵심 페이지 메타데이터 정비
4. noindex 경계 재검토
5. Product와 Shop structured data 추가
6. Search Console 등록과 색인 제출
7. 검색 의도형 콘텐츠 페이지 확장

## 10. Immediate Implementation Backlog

- 루트 HTML 5개 핵심 페이지 메타 description 추가
- canonical/og 메타 추가
- 실제 도메인 기준 sitemap.xml 생성
- product, edition 페이지용 JSON-LD 추가
- Search Console 제출용 site verification 메타 또는 DNS 설정