import { Point } from "./Point.js";

export class Thread {
  constructor(canvas, ctx, x, options = {}) {
    this.canvas = canvas;
    this.ctx = ctx;

    // 물리 옵션 (기본값 포함)
    this.gravity   = options.gravity   ?? 0.5;
    this.friction  = options.friction  ?? 0.995;

    // Constraint/solver options
    this.iterations = options.iterations ?? 12; // more passes -> stiffer/less elastic
    this.tailDamping = options.tailDamping ?? 0.02; // smoothing along the tail

    // 형태 옵션
    this.segments  = options.segments  ?? 100;
    this.color     = options.color     ?? "#B11226";
    this.width     = options.width     ?? 2;

    this.segmentLength = canvas.height / (this.segments - 1);
    this.points = [];

    for (let i = 0; i < this.segments; i++) {
      this.points.push(
        new Point(x, i * this.segmentLength, i === 0)
      );
    }
  }

  applyForce(strength = 8) {
    for (let i = 6; i < this.points.length; i++) {
      this.points[i].x +=
        (Math.random() - 0.5) * strength * (i / this.points.length);
    }
  }

  constrain() {
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = (dist - this.segmentLength) / dist;

      if (!p1.fixed) {
        p1.x += dx * diff * 0.5;
        p1.y += dy * diff * 0.5;
      }
      if (!p2.fixed) {
        p2.x -= dx * diff * 0.5;
        p2.y -= dy * diff * 0.5;
      }
    }
  }

  update() {
    this.points.forEach((p, i) => {
      p.update(this.gravity, this.friction);
      // gentle end-tail damping to smooth wave propagation
      const t = i / this.points.length;
      p.oldX += (p.x - p.oldX) * t * this.tailDamping;
    });

    // run constraint solver multiple times to reduce stretchiness
    for (let i = 0; i < this.iterations; i++) this.constrain();
  }

  draw() {
    const ctx = this.ctx;
    const pts = this.points;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;

      ctx.quadraticCurveTo(
        pts[i].x,
        pts[i].y,
        midX,
        midY
      );
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}
