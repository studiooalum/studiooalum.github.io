import { Thread } from "./Thread.js";
import { initMobileControls } from "./mobileControls.js";

export function initThreadScene({ mobile = false } = {}) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  const menuWrap = document.querySelector(".menu-wrap");

  // 📱 모바일 / 💻 데스크탑 기준 위치 분기
  const rect = menuWrap.getBoundingClientRect();
  const threadX = mobile
    ? canvas.width * 0.5     // 모바일: 중앙
    : rect.left + rect.width + 50;

  const thread = new Thread(canvas, ctx, threadX, {
    gravity: mobile ? 0.9 : 0.5,   // 모바일 중력 강화
    friction: 0.995,
    segments: mobile ? 70 : 100,   // 모바일은 조금 단순하게
    color: "#B11226",
    width: mobile ? 2.5 : 2
  });

  // 💻 데스크탑 전용 인터랙션
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

  // 📱 모바일 전용 컨트롤 연결
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
