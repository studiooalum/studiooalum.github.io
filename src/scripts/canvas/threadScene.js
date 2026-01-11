import { Thread } from "./Thread.js";
import { initMobileControls } from "./mobileControls.js";

export function initThreadScene({ mobile = false } = {}) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const menuWrap = document.querySelector(".menu-wrap");

  console.log("canvas:", canvas);
  console.log("ctx:", ctx);
  console.log("menuWrap:", menuWrap);
  console.log("mobile:", mobile);

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
