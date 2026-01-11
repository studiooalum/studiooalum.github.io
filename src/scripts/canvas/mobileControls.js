// src/scripts/canvas/mobileControls.js

export function initMobileControls(thread, canvas) {
  let grabbedPoint = null;
  let smoothX = 0;
  let smoothY = 0;

  function getTouchPos(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function findNearestPoint(x, y, threshold = 30) {
    let nearest = null;
    let minDist = Infinity;

    thread.points.forEach(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d < threshold && d < minDist) {
        nearest = p;
        minDist = d;
      }
    });

    return nearest;
  }

  function dragPoint(point, x, y) {
    const strength = 0.12; // gentler pull on mobile
    // limit maximum instant adjustment to avoid huge impulses
    const dx = Math.max(-60, Math.min(60, x - point.x));
    const dy = Math.max(-60, Math.min(60, y - point.y));
    // subtract so old position is nudged opposite, producing velocity toward target
    point.oldX -= dx * strength;
    point.oldY -= dy * strength;
  }

  // Prefer Pointer Events when available to avoid duplicate touch+pointer handling
  if (window.PointerEvent) {
    let pointerActive = false;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = findNearestPoint(x, y);
      if (point) {
        grabbedPoint = point;
        smoothX = x;
        smoothY = y;
        pointerActive = true;
      }
    });

    canvas.addEventListener('pointermove', e => {
      if (!pointerActive || !grabbedPoint) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      smoothX += (x - smoothX) * 0.2;
      smoothY += (y - smoothY) * 0.2;
      dragPoint(grabbedPoint, smoothX, smoothY);
    });

    canvas.addEventListener('pointerup', () => {
      pointerActive = false;
      grabbedPoint = null;
    });
  } else {
    // fallback to touch events
    canvas.addEventListener("touchstart", e => {
      const { x, y } = getTouchPos(e.touches[0]);
      const point = findNearestPoint(x, y);

      if (point) {
        grabbedPoint = point;
        smoothX = x;
        smoothY = y;
      }
    }, { passive: false });

    canvas.addEventListener("touchmove", e => {
      if (!grabbedPoint) return;
      const { x, y } = getTouchPos(e.touches[0]);

      // smoothing
      smoothX += (x - smoothX) * 0.2;
      smoothY += (y - smoothY) * 0.2;

      dragPoint(grabbedPoint, smoothX, smoothY);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchend", () => {
      grabbedPoint = null;
    });
  }
}
