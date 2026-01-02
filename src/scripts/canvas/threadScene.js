import { Thread } from "./Thread.js";

export function initThreadScene() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  const menuWrap = document.querySelector(".menu-wrap");
  const rect = menuWrap.getBoundingClientRect();
  const threadX = rect.left + rect.width + 50;

  const thread = new Thread(canvas, ctx, threadX, {
    gravity: 0.5,
    friction: 0.995,
    segments: 100,
    color: "#B11226",
    width: 2
  });

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

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    thread.update();
    thread.draw();
    requestAnimationFrame(animate);
  }
  animate();
}
