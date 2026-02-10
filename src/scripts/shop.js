
console.log("🔥 shop.js loaded");

// Preview mode: when true, skip loading Sanity (avoids bundler/import issues)
const PREVIEW_MODE = true;

// Sanity imports are loaded dynamically only when PREVIEW_MODE is false
// (this prevents import errors for @sanity packages in unbundled environments)

const previewPalette = [
  '#FF6B6B', // vivid red
  '#4ECDC4', // teal
  '#FFD93D', // yellow
  '#FF6F00', // orange
  '#9B5DE5', // purple
  '#00B4D8', // cyan
  '#F94144', // strong coral
  '#277DA1'  // deep blue
];

const rugPatches = Array.from({ length: 24 }, (_, i) => ({
  kind: "solid",
  color: previewPalette[i % previewPalette.length],
  span: 1,
  height: 1
}));

// Render initial 24 patches immediately
// (will be replaced when Sanity data arrives)
const track = document.getElementById("rugTrack");
function renderInitial() {
  track.innerHTML = "";
  rugPatches.forEach(patch => {
    const el = document.createElement("div");
    el.classList.add("patch", `kind-${patch.kind}`);
    el.style.gridColumn = `span ${patch.span || 1}`;
    el.style.gridRow = `span ${patch.height || 1}`;
    if (patch.kind === "solid" && patch.color) {
      // set inline background to ensure vivid preview colors are visible
      el.style.backgroundColor = patch.color;
    }
    track.appendChild(el);
  });
}
renderInitial();

// Replace the first patch with a product patch from Sanity (dynamically loaded)
if (!PREVIEW_MODE) {
  Promise.all([
    import('./sanity/client.js'),
    import('./sanity/queries.js'),
    import('./sanity/image.js')
  ])
    .then(([clientMod, queriesMod, imageMod]) => {
      const client = clientMod.default;
      const PATCHWORK_GLOVES_QUERY = queriesMod.PATCHWORK_GLOVES_QUERY;
      const urlFor = imageMod.urlFor;

      return client.fetch(PATCHWORK_GLOVES_QUERY).then(product => {
        if (product) {
          rugPatches[0] = {
            kind: "product",
            id: product._id,
            productData: {
              title: product.title,
              image: product.images && product.images.length > 0 ? urlFor(product.images[0]).width(300).url() : product.image,
              slug: product.slug,
              description: product.description
            },
            span: 1,
            height: 2
          };
          // Re-render with the product patch
          renderRug();
        }
      });
    })
    .catch(err => {
      console.error('Sanity load/fetch failed', err);
    });
}

// import { rugPatches } from "../data/rugPatches.js";

/* =========================
  PREVIEW MODE (defined at top)
  true  : 이미지 없이 구조만 확인
  false : 실제 상품 / 이미지 렌더링
========================= */

/* =========================
   DOM (already declared above in renderInitial)
========================= */

/* =========================
   RENDER
========================= */
function renderRug() {
  // 혹시 모르니 초기화 (재렌더 대비)
  track.innerHTML = "";

  rugPatches.forEach(patch => {
    const el = document.createElement("div");

    /* --- 기본 클래스 --- */
    el.classList.add("patch");
    el.classList.add(`kind-${patch.kind}`);

    /* --- Grid Span 설정 --- */
    el.style.gridColumn = `span ${patch.span || 1}`;
    el.style.gridRow = `span ${patch.height || 1}`;

    /* --- 상품 위치 보정 (중앙 줄 고정 예외) --- */
    if (patch.kind === "product" && patch.height === 2) {
      el.style.gridRowStart = "2";
    }

    /* =========================
       KIND별 처리
    ========================= */

    /* 1. SOLID (단색 원단) */
    if (patch.kind === "solid" && patch.color) {
      // set inline background to ensure vivid preview colors are visible
      el.style.backgroundColor = patch.color;
    }

    /* 2. PATTERN (원단 패턴) */
    if (patch.kind === "pattern") {
      const patternType = patch.patternType || "default";
      el.classList.add(`pattern-${patternType}`);
    }

    /* 3. PRODUCT (상품 패치) */
    if (patch.kind === "product") {
      el.dataset.id = patch.id || "";

      // 실제 렌더링 모드 + 이미지 존재
      if (!PREVIEW_MODE && patch.productData?.image) {
        const img = document.createElement("img");
        img.src = patch.productData.image;
        img.alt = patch.productData.title || "";
        img.draggable = false;
        el.appendChild(img);

        el.dataset.link = `/product.html?slug=${patch.productData.slug?.current || ""}`;
      } 
      // 🔥 PREVIEW MODE: 더미 표현
      else {
        el.classList.add("preview-product");
      }
    }

    track.appendChild(el);
  });
}

/* =========================
function renderRug() {
  rugPatches.forEach(patch => {
    const el = document.createElement("div");
    
    // 기본 클래스
    el.classList.add("patch");
    el.classList.add(`kind-${patch.kind}`);
    
    // Grid Span & Height 적용 (데이터 기반)
    // span이 2면 가로 2칸, height가 2면 세로 2칸
    el.style.gridColumn = `span ${patch.span || 1}`;
    el.style.gridRow = `span ${patch.height || 1}`;

    // ★ 핵심: 상품은 무조건 가운데 줄(2행)에서 시작하도록 강제
    // (러그 디자인에 따라 이 부분은 조정 가능)
    if (patch.kind === 'product' && patch.height === 2) {
      el.style.gridRowStart = '2'; 
    }

    // 내용 채우기
    if (patch.kind === 'product' && patch.image) {
      const img = document.createElement('img');
      img.src = patch.image;
      img.draggable = false; // 이미지 자체 드래그 방지 (컨테이너 드래그 위해)
      el.appendChild(img);
      
      // 클릭 이벤트 (드래그와 구분하기 위해 별도 처리 필요)
      el.dataset.link = `/product.html?id=${patch.id}`; // 임시 링크 저장
    } 
    else if (patch.kind === 'text') {
      el.textContent = patch.text;
    } 
    else if (patch.kind === 'pattern') {
      if (patch.pattern) el.classList.add(`pattern-${patch.pattern}`);
    }

    track.appendChild(el);
  });
}

========================= */

// 초기 렌더링 실행
renderRug();


// --- 2. 물리 엔진 (Smooth Drag & Scroll) ---
// 변수 설정
let currentX = 0;   // 현재 화면 위치
let targetX = 0;    // 목표 위치
let isDragging = false;
let startX = 0;     // 드래그 시작 X 좌표
let lastX = 0;      // 드래그 직전 targetX

// 클릭 vs 드래그 구분용 변수
let dragStartX = 0; 
let isClick = true; 

const friction = 0.08; // 감속 계수 (0.01~0.1 사이, 작을수록 더 미끄러짐)

// 최대 스크롤 가능 범위 계산
const getMaxScroll = () => track.scrollWidth - window.innerWidth;

// A. 이벤트 핸들러 정의

const handleWheel = (e) => {
  // 가로/세로 휠 모두 대응
  targetX += (e.deltaY + e.deltaX);
  // 범위 제한 (즉시 반영하지 않고 animate 루프에서 부드럽게 처리해도 됨)
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

const handleDown = (e) => {
  isDragging = true;
  isClick = true; // 일단 클릭으로 가정
  
  const pageX = e.pageX || e.touches[0].pageX;
  startX = pageX;
  dragStartX = pageX; // 클릭 판별용 시작점
  lastX = targetX;
  
  track.parentElement.style.cursor = 'grabbing';
};

const handleMove = (e) => {
  if (!isDragging) return;
  
  const pageX = e.pageX || e.touches[0].pageX;
  
  // 조금이라도 움직였으면 클릭이 아님
  if (Math.abs(pageX - dragStartX) > 5) {
    isClick = false;
  }

  const walk = (pageX - startX) * 1.5; // 1.5는 드래그 속도 배수
  targetX = lastX - walk;
  
  // 범위 제한 (드래그 중에는 약간의 탄성을 위해 제한을 느슨하게 할 수도 있음)
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

const handleUp = (e) => {
  isDragging = false;
  track.parentElement.style.cursor = 'grab';
  
  // 드래그가 아니라 순수 클릭이었고, 타겟이 상품이라면?
  if (isClick) {
    const productEl = e.target.closest('.kind-product');
    if (productEl) {
      console.log("상품 클릭됨:", productEl.dataset.link);
      // 여기서 모달을 띄우거나 페이지 이동
      // window.location.href = productEl.dataset.link;
    }
  }
};

// B. 이벤트 바인딩
window.addEventListener('wheel', handleWheel, { passive: true });

window.addEventListener('mousedown', handleDown);
window.addEventListener('touchstart', handleDown);

window.addEventListener('mousemove', handleMove);
window.addEventListener('touchmove', handleMove);

window.addEventListener('mouseup', handleUp);
window.addEventListener('touchend', handleUp);


// C. 애니메이션 루프 (RAF)
function animate() {
  // Lerp (선형 보간) 공식: 현재값 += (목표값 - 현재값) * 마찰계수
  currentX += (targetX - currentX) * friction;
  
  // 변위가 0.1px 미만이면 연산 중단 (성능 최적화) - 생략 가능하지만 넣으면 좋음
  
  // 트랙 이동
  track.style.transform = `translateX(${-currentX.toFixed(2)}px)`;
  
  requestAnimationFrame(animate);
}

animate();
