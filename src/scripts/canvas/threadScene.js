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

  // always place thread anchor at horizontal center of the canvas
  const threadX = canvas.width * 0.5;

  const thread = new Thread(canvas, ctx, threadX, {
    gravity: mobile ? 0.9 : 0.5,
    friction: 0.995,
    segments: mobile ? 70 : 100,
    color: "#B11226",
    width: mobile ? 2.5 : 2
  });

  // keep thread horizontally centered when viewport changes
  function centerThreadHorizontally() {
    if (!thread || !thread.points || !thread.points.length) return;
    const cx = Math.round(canvas.width * 0.5);
    const p0 = thread.points[0];
    const delta = cx - p0.x;
    if (delta === 0) return;
    for (let i = 0; i < thread.points.length; i++) {
      const p = thread.points[i];
      p.x += delta;
      p.oldX += delta;
    }
  }
  // run once to ensure initial centering and after resize
  centerThreadHorizontally();
  window.addEventListener('resize', () => {
    resize();
    centerThreadHorizontally();
  });

  // no DOM test markers in production

  // debug exports removed

  // 💻 데스크탑 전용
  if (!mobile) {
    document.querySelectorAll(".menu a").forEach(link => {
      link.addEventListener("mouseenter", () => {
        thread.applyForce(10);
      });
    });

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

    if (thread.applyTilt) {
      thread.applyTilt();
    }

    thread.update();
    thread.draw();
    requestAnimationFrame(animate);
  }

  animate();
}
