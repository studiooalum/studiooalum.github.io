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

  // place thread anchor at horizontal center of the canvas
  const threadX = canvas.width * 0.5;

  const thread = new Thread(canvas, ctx, threadX, {
    gravity: mobile ? 0.9 : 0.5,
    friction: 0.995,
    segments: mobile ? 70 : 100,
    color: "#B11226",
    width: mobile ? 2.5 : 2
  });

  // center the fixed anchor of the thread (first point) on init/resize
  function centerThread() {
    if (!thread || !thread.points || !thread.points.length) return;
    const cx = Math.round(canvas.width * 0.5);
    const cy = Math.round(canvas.height * 0.5); // anchor at vertical center
    const p0 = thread.points[0];
    p0.x = cx;
    p0.oldX = cx;
    p0.y = cy;
    p0.oldY = cy;
  }
  centerThread();
  // ensure thread stays centered when viewport resizes
  window.addEventListener('resize', () => {
    resize();
    centerThread();
    positionMenu();
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

  // Menu interactions: hover color-sync (attach on all environments for preview/PC)
  document.querySelectorAll('.menu a').forEach(link => {
    const applyThreadColor = () => { try { link.style.color = thread.color } catch (e) {} };
    const restoreColor = () => { try { link.style.color = '' } catch (e) {} };

    link.addEventListener('mouseenter', () => {
      thread.applyForce(10);
      applyThreadColor();
    });
    link.addEventListener('mouseleave', () => {
      restoreColor();
    });
  });

  // remove cursor-driven motion so thread stays centered and predictable

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

