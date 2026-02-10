console.log("🔥 shop.js loaded");

/* =========================
   PREVIEW MODE
   true  : 이미지 없이 구조만 확인
   false : 실제 상품 / 이미지 렌더링
========================= */
const PREVIEW_MODE = true;

/* =========================
   PRODUCT DATASET STUB
   (4-6 items until Sanity integration)
========================= */
const products = [
  { id: 'prod-1', title: 'Patchwork Gloves A', slug: 'gloves-a' },
  { id: 'prod-2', title: 'Patchwork Gloves B', slug: 'gloves-b' },
  { id: 'prod-3', title: 'Patchwork Gloves C', slug: 'gloves-c' },
  { id: 'prod-4', title: 'Patchwork Gloves D', slug: 'gloves-d' },
  { id: 'prod-5', title: 'Patchwork Gloves E', slug: 'gloves-e' }
];

/* =========================
   TEXTILE PATCH COLORS
========================= */
const textileColors = [
  "#e0ddd3", "#cfcabf", "#d4cfc5", "#e8e4d9",
  "#c9c4ba", "#dad5cb", "#e5e1d6", "#ccc7bd"
];

/* =========================
   LAYOUT GENERATION
========================= */
let rugPatches = [];

// Fisher-Yates shuffle for proper randomization
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateRugLayout() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const productCount = products.length;
  
  // 1. Calculate target rug width
  const widthMultiplier = Math.max(2, 2 + 0.5 * Math.max(0, productCount - 4));
  const targetRugWidth = viewportWidth * widthMultiplier;
  
  // 2. Base unit width = viewport height / 4 (for square patches)
  const unitWidth = viewportHeight / 4;
  
  // 3. Calculate target columns
  const targetColumns = Math.ceil(targetRugWidth / unitWidth);
  
  // 4. Generate patches array
  rugPatches = [];
  
  // Track which columns are occupied in each row
  const occupiedSpaces = Array(4).fill(null).map(() => new Set());
  
  // Shuffle products for random placement using Fisher-Yates
  const shuffledProducts = shuffleArray(products);
  let productIndex = 0;
  
  // First pass: fill with textile patches to establish base structure
  for (let col = 0; col < targetColumns; col++) {
    for (let row = 0; row < 4; row++) {
      // Skip if already occupied
      if (occupiedSpaces[row].has(col)) continue;
      
      // Determine span (1-3) but ensure we don't exceed target width
      const remainingCols = targetColumns - col;
      const maxSpan = Math.min(3, remainingCols);
      const span = Math.floor(Math.random() * maxSpan) + 1;
      
      // Mark occupied spaces
      for (let i = 0; i < span; i++) {
        occupiedSpaces[row].add(col + i);
      }
      
      // Choose kind (70% solid, 30% pattern for textiles)
      const kind = Math.random() > 0.7 ? 'pattern' : 'solid';
      
      rugPatches.push({
        kind: kind,
        color: textileColors[Math.floor(Math.random() * textileColors.length)],
        patternType: kind === 'pattern' ? 'denim' : undefined,
        span: span,
        height: 1,
        row: row + 1
      });
    }
  }
  
  // Second pass: randomly replace some middle-row textile patches with products
  const middleRowPatches = rugPatches.filter(p => p.row === 2 || p.row === 3);
  
  // Shuffle and select random positions for products using Fisher-Yates
  const middleIndices = middleRowPatches.map((_, i) => i);
  const shuffledMiddleIndices = shuffleArray(middleIndices)
    .slice(0, Math.min(productCount, middleRowPatches.length));
  
  shuffledMiddleIndices.forEach((middleIdx, prodIdx) => {
    if (prodIdx >= productCount) return;
    
    // Find the actual patch index in rugPatches
    let actualIdx = 0;
    let middleCount = 0;
    for (let i = 0; i < rugPatches.length; i++) {
      if (rugPatches[i].row === 2 || rugPatches[i].row === 3) {
        if (middleCount === middleIdx) {
          actualIdx = i;
          break;
        }
        middleCount++;
      }
    }
    
    // Replace with product
    const product = shuffledProducts[prodIdx];
    rugPatches[actualIdx] = {
      kind: 'product',
      id: product.id,
      productData: product,
      span: 1,
      height: 1,
      row: rugPatches[actualIdx].row
    };
  });
  
  return { targetColumns, unitWidth };
}

/* =========================
   DOM
========================= */
const track = document.getElementById("rugTrack");

/* =========================
   RENDER
========================= */
function renderRug() {
  // Generate layout
  const { targetColumns, unitWidth } = generateRugLayout();
  
  // Update CSS grid columns
  track.style.gridTemplateColumns = `repeat(${targetColumns}, ${unitWidth}px)`;
  
  // Clear and render patches
  track.innerHTML = "";

  rugPatches.forEach(patch => {
    const el = document.createElement("div");

    /* --- 기본 클래스 --- */
    el.classList.add("patch");
    el.classList.add(`kind-${patch.kind}`);

    /* --- Grid Span 설정 --- */
    el.style.gridColumn = `span ${patch.span || 1}`;
    el.style.gridRow = `${patch.row} / span 1`;

    /* =========================
       KIND별 처리
    ========================= */

    /* 1. SOLID (단색 원단) */
    if (patch.kind === "solid" && patch.color) {
      el.style.setProperty("--patch-color", patch.color);
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
        // Add title for debugging
        const label = document.createElement("span");
        label.textContent = patch.productData.title || patch.id;
        label.classList.add("product-label");
        el.appendChild(label);
      }
    }

    track.appendChild(el);
  });
}

// 초기 렌더링 실행
renderRug();

// 윈도우 리사이즈 시 재생성
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderRug();
    // Update max scroll after regeneration
    targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
  }, 250);
});


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
