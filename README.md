```bash
git clone https://github.com/studiooalum/studiooalum.github.io.git
cd studiooalum.github.io
# make changes...
git add .
git commit -m "Update site"
git push origin main
```

# studiooalum.github.io

This is the GitHub Pages repository for the user site `studiooalum.github.io`.

To run locally:
- Edit files in this repo (index.html, assets).
- Commit and push to `main` (or to the branch configured under Settings → Pages).

Site URL: https://studiooalum.github.io

## Overview

이 프로젝트는 **정적 웹 기반의 개인/소규모 프로젝트**를 위한 기본 뼈대입니다.
HTML, CSS, Vanilla JavaScript를 사용하며, 디자인 중심의 작업과 가벼운 인터랙션을 염두에 두고 설계되었습니다.

초기에는 단순한 구조로 빠르게 작업할 수 있고, 이후 필요에 따라 React, Vite 등의 빌드 도구로 확장하거나 이전하기 쉬운 형태를 목표로 합니다.

---

## Goals

* 작업과 구조를 명확히 분리한다
* 혼자 작업해도 헷갈리지 않는 파일 배치
* 디자인과 콘텐츠에 집중할 수 있는 환경
* 추후 확장 시 전체 구조를 갈아엎지 않도록 설계

---

## Tech Stack

* HTML5
* CSS3 (모듈화된 CSS 파일 구조)
* Vanilla JavaScript (ES Modules)

※ 빌드 도구 없이도 동작하며, 필요 시 Vite / React로 이전 가능

---

## Project Structure

```txt
project-root/
├─ public/                 # 정적 리소스
│  ├─ images/
│  ├─ fonts/
│  └─ favicon.ico
│
├─ src/
│  ├─ index.html           # 메인 HTML
│  │
│  ├─ styles/
│  │  ├─ reset.css         # 브라우저 초기화
│  │  ├─ variables.css     # 색상, 폰트, spacing 변수
│  │  ├─ layout.css        # 전체 레이아웃
│  │  ├─ components.css    # 공통 컴포넌트 스타일
│  │  └─ main.css          # CSS entry point
│  │
│  ├─ scripts/
│  │  ├─ main.js           # JS entry point
│  │  ├─ utils/            # 헬퍼 함수
│  │  │  └─ helpers.js
│  │  └─ components/       # UI 컴포넌트 단위 JS
│  │     └─ menu.js
│  │
│  └─ data/                # JSON, 임시 데이터
│     └─ mock.json
│
├─ .gitignore
├─ README.md
└─ package.json            # (선택) 빌드 도구 사용 시
```

---

## File Responsibilities

### HTML

* `index.html`

  * 전체 레이아웃의 뼈대
  * CSS / JS entry 연결
  * 최소한의 마크업만 유지

### CSS

* `variables.css`

  * 컬러, 폰트, 여백 등 디자인 토큰 정의
* `layout.css`

  * header / footer / main 구조
* `components.css`

  * 버튼, 메뉴, 카드 등 재사용 컴포넌트
* `main.css`

  * 모든 CSS를 불러오는 진입 파일

### JavaScript

* `main.js`

  * 초기 실행 로직
  * 컴포넌트 렌더링 호출
* `components/`

  * UI 단위별 기능 분리
* `utils/`

  * 공통 로직, 헬퍼 함수

---

## Naming Conventions

* 파일명: 소문자 + 하이픈 또는 camelCase
* 클래스명: 기능 중심 네이밍
* JS 함수: 동사 + 명사 (`renderMenu`, `initApp` 등)

---

## Development Notes

* CSS는 가능한 한 **구조 → 컴포넌트 → 디테일** 순서로 작성
* JS는 DOM 직접 조작을 최소화하고 컴포넌트 단위로 분리
* 데이터가 늘어나면 `data/` 디렉토리 기준으로 관리

---

## Possible Extensions

* Vite 도입
* React / Vue 전환
* CSS Preprocessor 또는 Tailwind 적용
* 작업 아카이브 / CMS 연동

---

## Author

Oalum

## License

Private / Personal Project
