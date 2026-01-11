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

  // no DOM test markers in production

  // debug exports removed

  // Menu interactions (hover on desktop, press on mobile) — sync menu color with thread
  document.querySelectorAll('.menu a').forEach(link => {
    const origColor = getComputedStyle(link).color;

    const applyThreadColor = () => { try { link.style.color = thread.color } catch (e) {} };
    const restoreColor = () => { link.style.color = origColor };

    // mouse hover
    link.addEventListener('mouseenter', () => {
      thread.applyForce(10);
      applyThreadColor();
    });
    link.addEventListener('mouseleave', () => {
      restoreColor();
    });

    // pointer/touch interactions
    link.addEventListener('pointerdown', () => {
      thread.applyForce(10);
      applyThreadColor();
    });
    link.addEventListener('pointerup', () => {
      restoreColor();
    });
    link.addEventListener('touchstart', () => {
      thread.applyForce(10);
      applyThreadColor();
    }, { passive: true });
    link.addEventListener('touchend', () => {
      restoreColor();
    });
  });

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
