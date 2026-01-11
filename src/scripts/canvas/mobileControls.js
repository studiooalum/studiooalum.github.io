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

  function findNearestPoint(x, y, threshold = 50) {
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
    const follow = 1.0; // immediate follow toward finger (no latency)
    // limit maximum instant adjustment to avoid huge impulses
    const dxRaw = x - point.x;
    const dyRaw = y - point.y;
    const dx = Math.max(-60, Math.min(60, dxRaw));
    const dy = Math.max(-60, Math.min(60, dyRaw));

    // immediate follow: set position to touch
    point.x = x;
    point.y = y;

    // reset previous position to avoid latency/overshoot
    point.oldX = x;
    point.oldY = y;
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
        // pin while touching
        grabbedPoint.fixed = true;
        grabbedPoint.x = x; grabbedPoint.y = y;
        grabbedPoint.oldX = x; grabbedPoint.oldY = y;
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
      // immediate follow while touching
      dragPoint(grabbedPoint, x, y);
    });

    canvas.addEventListener('pointerup', () => {
      pointerActive = false;
      if (grabbedPoint) grabbedPoint.fixed = false;
      grabbedPoint = null;
    });
  } else {
    // fallback to touch events
    canvas.addEventListener("touchstart", e => {
      const { x, y } = getTouchPos(e.touches[0]);
      const point = findNearestPoint(x, y);

      if (point) {
        grabbedPoint = point;
        // pin while touching
        grabbedPoint.fixed = true;
        grabbedPoint.x = x; grabbedPoint.y = y;
        grabbedPoint.oldX = x; grabbedPoint.oldY = y;
        smoothX = x;
        smoothY = y;
      }
    }, { passive: false });

    canvas.addEventListener("touchmove", e => {
      if (!grabbedPoint) return;
      const { x, y } = getTouchPos(e.touches[0]);

      // immediate follow while touching
      dragPoint(grabbedPoint, x, y);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchend", () => {
      if (grabbedPoint) grabbedPoint.fixed = false;
      grabbedPoint = null;
    });
  }
}
