// src/scripts/canvas/mobileControls.js

export function initMobileControls(thread, canvas) {
  let grabbedPoint = null;
  let tiltForceX = 0;

  /* =========================
     1. 기울기 → 외력 (중력 방향 느낌)
  ========================= */
  function handleOrientation(e) {
    const gamma = e.gamma ?? 0; // 좌우 기울기 (-90 ~ 90)
    tiltForceX = gamma * 0.015; // 감각 조절용 계수
  }

  // iOS 권한 처리
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const btn = document.createElement("button");
    btn.textContent = "Enable Motion";
    btn.className = "motion-btn";

    btn.addEventListener("click", async () => {
      // remove the button immediately so the UI reflects the click
      btn.remove();
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === "granted") {
          window.addEventListener("deviceorientation", handleOrientation);
        } else {
          console.log('deviceorientation permission denied:', permission);
        }
      } catch (e) {
        // some browsers may throw; fall back to attaching listener
        console.log('requestPermission error, attaching listener as fallback', e && e.message);
        window.addEventListener("deviceorientation", handleOrientation);
      }
    });

    document.body.appendChild(btn);
  } else {
    window.addEventListener("deviceorientation", handleOrientation);
  }

  /* =========================
     2. 손가락으로 실 집기
  ========================= */
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

  canvas.addEventListener("touchstart", e => {
    const { x, y } = getTouchPos(e.touches[0]);
    const point = findNearestPoint(x, y);

    if (point) {
      grabbedPoint = point;
      grabbedPoint.fixed = true;
      grabbedPoint.x = x;
      grabbedPoint.y = y;
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    if (!grabbedPoint) return;
    const { x, y } = getTouchPos(e.touches[0]);
    grabbedPoint.x = x;
    grabbedPoint.y = y;
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    if (grabbedPoint) {
      grabbedPoint.fixed = false;
      grabbedPoint = null;
    }
  });

  /* =========================
     3. 매 프레임 기울기 힘 적용
  ========================= */
  // apply tilt by setting a horizontal gravity component used by the physics update
  thread.applyTilt = function () {
    // apply a scaled gravityX so physics integrates over frames
    this.gravityX = tiltForceX;
  };
}
