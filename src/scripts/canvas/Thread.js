import { Point } from "./Point.js";

export class Thread {
  constructor(canvas, ctx, x, options = {}) {
    this.canvas = canvas;
    this.ctx = ctx;

    // 물리 옵션 (기본값 포함)
    this.gravity   = options.gravity   ?? 0.5;
    this.gravityX  = options.gravityX  ?? 0;      // 모바일 기울기 대비
    this.friction  = options.friction  ?? 0.995;

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
    this.points.forEach(p =>
      p.update(this.gravity, this.friction, this.gravityX)
    );
    for (let i = 0; i < 6; i++) this.constrain();
  }

  draw() {
    this.ctx.beginPath();
    this.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      this.ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.width;
    this.ctx.lineCap = "round";
    this.ctx.stroke();
  }
}
