import { Thread } from "./Thread.js";
import { initMobileControls } from "./mobileControls.js";

export function initThreadScene({ mobile = false } = {}) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const menuWrap = document.querySelector(".menu-wrap");

  // debug logs removed for production

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ✅ 안전한 X 위치 계산
  let threadX;
  if (!mobile && menuWrap) {
    const rect = menuWrap.getBoundingClientRect();
    threadX = rect.left + rect.width + 50;
  } else {
    threadX = canvas.width * 0.5;
  }

  const thread = new Thread(canvas, ctx, threadX, {
    gravity: mobile ? 0.9 : 0.5,
    friction: 0.995,
    segments: mobile ? 70 : 100,
    color: "#B11226",
    width: mobile ? 2.5 : 2
  });

  // Position menu centered vertically and fixed at the middle-left of the viewport
  // (do not follow the thread). This places the menu's center slightly left
  // of the page center so it visually sits to the left side of the thread.
  function positionMenu() {
    if (!menuWrap) return;
    try {
      const rect = menuWrap.getBoundingClientRect();
      const pageCenter = Math.round(window.innerWidth / 2);
      const offsetFromCenter = 120; // how much to shift left from exact center
      let left = Math.round(pageCenter - rect.width / 2 - offsetFromCenter);
      if (left < 8) left = 8;
      menuWrap.style.left = left + 'px';
    } catch (e) {}
  }
  positionMenu();
  window.addEventListener('resize', positionMenu);

  // no DOM test markers in production

  // debug exports removed

  // Menu interactions: desktop-only hover that syncs menu color with thread
  if (!mobile) {
    document.querySelectorAll('.menu a').forEach(link => {
      const origColor = getComputedStyle(link).color;

      const applyThreadColor = () => { try { link.style.color = thread.color } catch (e) {} };
      const restoreColor = () => { link.style.color = origColor };

      // mouse hover only on desktop
      link.addEventListener('mouseenter', () => {
        thread.applyForce(10);
        applyThreadColor();
      });
      link.addEventListener('mouseleave', () => {
        restoreColor();
      });
    });
  }

  // 💻 데스크탑-only pointer smoothing for thread following cursor
  if (!mobile) {
    window.addEventListener("mousemove", e => {
      const p = thread.points[thread.points.length - 1];
      const dx = e.clientX - p.x;
      if (Math.abs(dx) < 50) {
        p.x += dx * 0.07;
      }
    });
  }

  // 📱 모바일 전용
  if (mobile) {
    initMobileControls(thread, canvas);
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    thread.update();
    thread.draw();
    requestAnimationFrame(animate);
  }

  animate();
}
