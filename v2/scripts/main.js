/* =========================
   String Menu System - Main Logic
========================= */

const MENUS = [
  { id: 'about', word: 'ABOUT', color: '#FF4444' },
  { id: 'archive', word: 'ARCHIVE', color: '#FFD700' },
  { id: 'shop', word: 'SHOP', color: '#4488FF' },
  { id: 'newsletter', word: 'NEWSLETTER', color: '#FF69B4' },
];

let activeMenu = null;
let hoveredMenu = null;

/* =========================
   INITIALIZE: Place letters on paths
========================= */

function initializeLetters() {
  MENUS.forEach((menu) => {
    const pathElement = document.getElementById(`string-${menu.id}`);
    const lettersContainer = document.getElementById(`letters-${menu.id}`);
    const word = menu.word;

    if (!pathElement || !lettersContainer) return;

    const pathLength = pathElement.getTotalLength();
    
    // Create letters and distribute along path
    // Repeat the word multiple times to fill the path
    let allLetters = [];
    const repetitions = Math.ceil(pathLength / (word.length * 25)); // Adjust spacing
    const fullText = (word + ' ').repeat(repetitions);

    fullText.split('').forEach((char, idx) => {
      if (char === ' ') return;

      const tspanRatio = idx / fullText.length;
      const distAlongPath = tspanRatio * pathLength;
      const point = pathElement.getPointAtLength(distAlongPath);

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', point.x);
      textEl.setAttribute('y', point.y);
      textEl.setAttribute('fill', menu.color);
      textEl.textContent = char;
      textEl.classList.add('letter');
      textEl.dataset.charIndex = idx;
      textEl.dataset.originalX = point.x;
      textEl.dataset.originalY = point.y;

      lettersContainer.appendChild(textEl);
      allLetters.push({
        element: textEl,
        char: char,
        originalX: point.x,
        originalY: point.y,
        currentX: point.x,
        currentY: point.y,
      });
    });

    // Store for later use
    lettersContainer.dataset.letters = JSON.stringify(
      allLetters.map(l => ({ char: l.char, originalX: l.originalX, originalY: l.originalY }))
    );
  });
}

/* =========================
   WOBBLE ANIMATION: Strings move slightly
========================= */

function startWobbleAnimation() {
  const time = { value: 0 };

  gsap.to(time, {
    value: 1000,
    duration: 1000,
    repeat: -1,
    ease: 'none',
    onUpdate: function () {
      const t = time.value;

      MENUS.forEach((menu, idx) => {
        const pathElement = document.getElementById(`string-${menu.id}`);
        if (!pathElement || hoveredMenu === menu.id) return; // Don't wobble hovered string

        const speed = 0.5 + idx * 0.1;
        const offsetY = Math.sin(t * speed * 0.001) * 10;
        const offsetX = Math.cos(t * speed * 0.0008) * 5;

        pathElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
    },
  });
}

/* =========================
   HOVER: Letters gather into word
========================= */

function setupStringHover() {
  MENUS.forEach((menu) => {
    const stringGroup = document.querySelector(`.string-group[data-menu="${menu.id}"]`);
    const lettersContainer = document.getElementById(`letters-${menu.id}`);

    if (!stringGroup || !lettersContainer) return;

    stringGroup.addEventListener('mouseenter', () => {
      hoveredMenu = menu.id;
      gatherLetters(menu.id);
    });

    stringGroup.addEventListener('mouseleave', () => {
      hoveredMenu = null;
      scatterLetters(menu.id);
    });

    stringGroup.addEventListener('click', () => {
      transitionToPage(menu.id);
    });
  });
}

function gatherLetters(menuId) {
  const pathElement = document.getElementById(`string-${menuId}`);
  const lettersContainer = document.getElementById(`letters-${menuId}`);

  if (!pathElement || !lettersContainer) return;

  const pathBox = pathElement.getBBox();
  const centerX = pathBox.x + pathBox.width / 2;
  const centerY = pathBox.y + pathBox.height / 2;

  const letters = lettersContainer.querySelectorAll('text');
  const letterCount = letters.length;

  letters.forEach((letterEl, idx) => {
    const angle = (idx / letterCount) * Math.PI * 2;
    const radius = 60;

    const targetX = centerX + Math.cos(angle) * radius;
    const targetY = centerY + Math.sin(angle) * radius;

    gsap.to(letterEl, {
      attr: {
        x: targetX,
        y: targetY,
      },
      duration: 0.6,
      ease: 'back.out',
    });
  });
}

function scatterLetters(menuId) {
  const lettersContainer = document.getElementById(`letters-${menuId}`);

  if (!lettersContainer) return;

  const letters = lettersContainer.querySelectorAll('text');

  letters.forEach((letterEl) => {
    const originalX = parseFloat(letterEl.dataset.originalX);
    const originalY = parseFloat(letterEl.dataset.originalY);

    gsap.to(letterEl, {
      attr: {
        x: originalX,
        y: originalY,
      },
      duration: 0.6,
      ease: 'back.inOut',
    });
  });
}

/* =========================
   PAGE TRANSITION: Pull page up with string
========================= */

function transitionToPage(menuId) {
  const page = document.getElementById(`page-${menuId}`);
  const pathElement = document.getElementById(`string-${menuId}`);

  if (!page || !pathElement) return;

  activeMenu = menuId;

  // 1. Animate string path to expand upward (pulling motion)
  gsap.to(pathElement, {
    attr: { d: `M 600,0 Q 600,200 600,400` },
    duration: 1.2,
    ease: 'power2.inOut',
  });

  // 2. Slide page up into view
  gsap.to(page, {
    top: 0,
    opacity: 1,
    duration: 1.2,
    ease: 'power2.inOut',
    onComplete: () => {
      page.classList.add('active');
    },
  });

  // 3. Fade out strings menu
  gsap.to('.strings-svg', {
    opacity: 0.3,
    duration: 1,
    pointerEvents: 'none',
  });
}

/* =========================
   RETURN FROM PAGE: Pull page back down (back button functionality)
========================= */

function returnToMenu() {
  if (!activeMenu) return;

  const page = document.getElementById(`page-${activeMenu}`);
  const pathElement = document.getElementById(`string-${activeMenu}`);

  const initialPaths = {
    about: "M 200,150 Q 300,300 200,450",
    archive: "M 400,100 Q 500,350 400,550",
    shop: "M 600,120 Q 700,320 600,520",
    newsletter: "M 800,140 Q 900,340 800,540",
  };

  // 1. Restore string path
  gsap.to(pathElement, {
    attr: { d: initialPaths[activeMenu] },
    duration: 1.2,
    ease: 'power2.inOut',
  });

  // 2. Slide page back down
  gsap.to(page, {
    top: '100%',
    opacity: 0,
    duration: 1.2,
    ease: 'power2.inOut',
    onComplete: () => {
      page.classList.remove('active');
    },
  });

  // 3. Fade in strings menu
  gsap.to('.strings-svg', {
    opacity: 1,
    duration: 1,
    pointerEvents: 'auto',
  });

  activeMenu = null;
}

// Make returnToMenu global for onclick handlers
window.returnToMenu = returnToMenu;

/* =========================
   INIT
========================= */

window.addEventListener('load', () => {
  initializeLetters();
  setupStringHover();
  startWobbleAnimation();
});
