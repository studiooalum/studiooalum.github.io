export class Point {
  constructor(x, y, fixed = false) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.fixed = fixed;
  }

  update(gravity = 0.5, friction = 0.995) {
    if (this.fixed) return;

    const vx = (this.x - this.oldX) * friction;
    const vy = (this.y - this.oldY) * friction;

    this.oldX = this.x;
    this.oldY = this.y;

    this.x += vx;
    this.y += vy + gravity;
  }
}
