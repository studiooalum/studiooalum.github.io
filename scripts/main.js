/* ======================================================
   Studio OALUM – Yarn Menu
   Letters pushed by yarn boundary, 2D free physics
====================================================== */
(function () {
  'use strict';

  var svg = document.getElementById('svg-container');
  var yarnGroup = document.getElementById('yarn-group');
  var textGroup = document.getElementById('text-group');
  var overlay = document.getElementById('page-overlay');

  var W = window.innerWidth;
  var H = window.innerHeight;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var DATA = [
    { word: 'Archive',    color: '#eb4029', sw: 55, yOff: 0.2,  url: 'archive.html' },
    { word: 'Shop',       color: '#ffeb53', sw: 42, yOff: 0.42, url: 'shop.html' },
    { word: 'Class',      color: '#ffccc3', sw: 48, yOff: 0.66, url: 'class.html' },
    { word: 'Newsletter', color: '#cad5d8', sw: 40, yOff: 0.86, url: 'newsletter.html' }
  ];

  var yarns = [];
  var isPageOpen = false;
  var lastTs = 0;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalize(x, y) {
    var len = Math.sqrt(x * x + y * y) || 1;
    return { x: x / len, y: y / len };
  }

  function Yarn(cfg) {
    this.word = cfg.word.toUpperCase();
    this.color = cfg.color;
    this.sw = cfg.sw;
    this.baseY = H * cfg.yOff;
    this.url = cfg.url;

    this.points = [];
    for (var i = 0; i < 5; i++) {
      var t = i / 4;
      var edge = i === 0 || i === 4;
      var jy = edge ? 0 : (Math.random() - 0.5) * 180;
      this.points.push({
        x: t * W,
        y: this.baseY + jy,
        currentX: t * W,
        currentY: this.baseY + jy,
        angle: Math.random() * 6.283,
        speed: (0.004 + Math.random() * 0.008) * 1.5,
        ampX: edge ? 2 : 8 + Math.random() * 12,
        ampY: edge ? 3 : 16 + Math.random() * 24
      });
    }

    this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.pathEl.setAttribute('class', 'yarn');
    this.pathEl.setAttribute('stroke', this.color);
    this.pathEl.setAttribute('stroke-width', this.sw);
    yarnGroup.appendChild(this.pathEl);

    this.hitPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.hitPathEl.setAttribute('fill', 'none');
    this.hitPathEl.setAttribute('stroke', 'transparent');
    this.hitPathEl.setAttribute('stroke-width', Math.max(28, this.sw * 1.8));
    this.hitPathEl.style.cursor = 'pointer';
    this.hitPathEl.style.pointerEvents = 'stroke';
    yarnGroup.appendChild(this.hitPathEl);

    this.hovered = false;
    this.transitioning = false;
    this.hoverRatio = 0.5;
    this.hoverAmt = 0;
    this.letters = [];

    this._bind();
    this.updatePath();
    this._buildLetters();
  }

  Yarn.prototype._bind = function () {
    var self = this;

    if (canHover) {
      this.hitPathEl.addEventListener('mouseenter', function (e) {
        if (isPageOpen) return;
        self.hovered = true;
        self.hoverRatio = clamp(e.clientX / Math.max(1, W), 0, 1);
      });
      this.hitPathEl.addEventListener('mouseleave', function () {
        self.hovered = false;
      });
    }

    function handleClick() {
      if (isPageOpen) return;
      openPage(self);
    }

    this.hitPathEl.addEventListener('click', handleClick);
    this.pathEl.addEventListener('click', handleClick);
  };

  Yarn.prototype._buildLetters = function () {
    var pathLen = this.pathEl.getTotalLength() || W;
    var targetCount = Math.max(this.word.length * 2, Math.round(pathLen / 22));
    var repeats = Math.max(1, Math.round(targetCount / this.word.length));
    var total = repeats * this.word.length;
    var spacing = pathLen / total;

    // Remove old elements
    for (var k = 0; k < this.letters.length; k++) {
      if (this.letters[k].el.parentNode) {
        this.letters[k].el.parentNode.removeChild(this.letters[k].el);
      }
    }
    this.letters = [];

    for (var i = 0; i < total; i++) {
      var ch = this.word[i % this.word.length];
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.textContent = ch;
      el.setAttribute('class', 'yarn-text');
      textGroup.appendChild(el);

      // Arc anchor position
      var u = i * spacing + spacing * 0.5;
      var pt = this.pathEl.getPointAtLength(clamp(u, 0, pathLen));

      // Scatter initial position randomly within yarn cross-section
      var scatter = (Math.random() - 0.5) * this.sw * 0.5;
      var scatterY = (Math.random() - 0.5) * this.sw * 0.5;

      this.letters.push({
        el: el,
        u: u,           // arc anchor (fixed, used for rotation direction only)
        x: pt.x + scatter,
        y: pt.y + scatterY,
        vx: 0,
        vy: 0,
        px: pt.x,      // previous anchor x (for anchor velocity)
        py: pt.y,      // previous anchor y
        r: canHover ? 8.5 : 7
      });
    }
  };

  Yarn.prototype.updatePath = function () {
    var wScale = this.transitioning ? 0 : (1 - this.hoverAmt * 0.6);

    for (var i = 1; i < this.points.length - 1; i++) {
      var p = this.points[i];
      p.angle += p.speed;
      p.currentX = p.x + Math.cos(p.angle) * p.ampX * wScale;
      p.currentY = p.y + Math.sin(p.angle) * p.ampY * wScale;
    }

    this.points[0].currentX = 0;
    this.points[this.points.length - 1].currentX = W;

    var pts = this.points;
    var d = 'M ' + pts[0].currentX + ' ' + pts[0].currentY;
    for (var j = 0; j < pts.length - 1; j++) {
      var x1 = pts[j].currentX;
      var y1 = pts[j].currentY;
      var x2 = pts[j + 1].currentX;
      var y2 = pts[j + 1].currentY;
      var cpx = x1 + (x2 - x1) / 2;
      d += ' C ' + cpx + ' ' + y1 + ', ' + cpx + ' ' + y2 + ', ' + x2 + ' ' + y2;
    }

    this.pathEl.setAttribute('d', d);
    this.hitPathEl.setAttribute('d', d);

    var goal = (this.hovered || this.transitioning) ? 1 : 0;
    this.hoverAmt += (goal - this.hoverAmt) * 0.08;
    this.pathEl.setAttribute('stroke-width', this.sw * (1 + this.hoverAmt * 0.15));
    this.hitPathEl.setAttribute('stroke-width', Math.max(28, this.sw * 1.8));
  };

  Yarn.prototype.updateLetters = function (dt) {
    if (!this.letters.length) return;

    var pathLen = this.pathEl.getTotalLength();
    if (!pathLen) return;

    var count = this.letters.length;
    var yarnRadius = this.sw * 0.5;  // half stroke-width = physical edge
    var letterR = canHover ? 8.5 : 7;
    var edgeDist = yarnRadius + letterR; // distance at which yarn boundary hits letter center
    var minLetterGap = letterR * 2;
    var maxSpeed = 280;
    // Damping: time-constant ~0.6s → exp(-dt/0.6)
    var damping = Math.exp(-dt / 0.6);

    // ── 1. Yarn boundary pushes letters ──────────────────────
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      var u = clamp(L.u, 0, pathLen - 0.01);

      // Current anchor point on path
      var pt  = this.pathEl.getPointAtLength(u);
      var pt2 = this.pathEl.getPointAtLength(clamp(u + 2, 0, pathLen));
      var tLen = Math.sqrt((pt2.x - pt.x) * (pt2.x - pt.x) + (pt2.y - pt.y) * (pt2.y - pt.y)) || 1;
      var tx = (pt2.x - pt.x) / tLen;
      var ty = (pt2.y - pt.y) / tLen;
      // Normal (perpendicular)
      var nx = -ty, ny = tx;

      // Anchor velocity this frame
      var anchorVx = (pt.x - L.px) / dt;
      var anchorVy = (pt.y - L.py) / dt;

      // Distance from letter to anchor
      var dx = L.x - pt.x;
      var dy = L.y - pt.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      // Push direction: away from anchor center
      var pushX = dist > 0.01 ? dx / dist : nx;
      var pushY = dist > 0.01 ? dy / dist : ny;

      if (dist < edgeDist) {
        // Relative velocity along push direction
        var relVx = L.vx - anchorVx;
        var relVy = L.vy - anchorVy;
        var relVn = relVx * pushX + relVy * pushY;

        // Only push if closing in
        if (relVn < 0) {
          var restitution = 0.3;
          var impulse = -(1.0 + restitution) * relVn;
          L.vx += impulse * pushX;
          L.vy += impulse * pushY;
        }

        // Position correction (prevent overlap)
        var correction = edgeDist - dist;
        L.x += pushX * correction;
        L.y += pushY * correction;
      }

      // Weak restoring: pull back when drifted too far
      var restoreThresh = edgeDist + 40;
      if (dist > restoreThresh) {
        var pull = (dist - restoreThresh) * 4;
        L.vx -= (dx / dist) * pull * dt;
        L.vy -= (dy / dist) * pull * dt;
      }

      // Store anchor for next frame
      L.px = pt.x;
      L.py = pt.y;
    }

    // ── 2. Letter–letter collision ────────────────────────────
    for (var a = 0; a < count; a++) {
      for (var b = a + 1; b < count; b++) {
        var A = this.letters[a];
        var B = this.letters[b];
        var cdx = B.x - A.x;
        var cdy = B.y - A.y;
        var cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 0.001;
        if (cdist >= minLetterGap) continue;

        var cnx = cdx / cdist;
        var cny = cdy / cdist;
        var pen = minLetterGap - cdist;

        // Position correction
        A.x -= cnx * pen * 0.5;
        A.y -= cny * pen * 0.5;
        B.x += cnx * pen * 0.5;
        B.y += cny * pen * 0.5;

        // Velocity response
        var cRelVx = B.vx - A.vx;
        var cRelVy = B.vy - A.vy;
        var cRelVn = cRelVx * cnx + cRelVy * cny;
        if (cRelVn < 0) {
          var cImp = cRelVn * 0.6;
          A.vx += cImp * cnx;
          A.vy += cImp * cny;
          B.vx -= cImp * cnx;
          B.vy -= cImp * cny;
        }
      }
    }

    // ── 3. Integrate + clamp + damp ───────────────────────────
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      var spd = Math.sqrt(L.vx * L.vx + L.vy * L.vy);
      if (spd > maxSpeed) {
        L.vx = (L.vx / spd) * maxSpeed;
        L.vy = (L.vy / spd) * maxSpeed;
      }
      L.vx *= damping;
      L.vy *= damping;
      L.x += L.vx * dt;
      L.y += L.vy * dt;
    }

    // ── 4. Render ─────────────────────────────────────────────
    for (var r = 0; r < count; r++) {
      var C = this.letters[r];
      var u = clamp(C.u, 0, pathLen - 0.01);
      var rpt  = this.pathEl.getPointAtLength(u);
      var rpt2 = this.pathEl.getPointAtLength(clamp(u + 2, 0, pathLen));
      var rtx = rpt2.x - rpt.x;
      var rty = rpt2.y - rpt.y;
      var rtLen = Math.sqrt(rtx * rtx + rty * rty) || 1;
      rtx /= rtLen; rty /= rtLen;
      var ang = Math.atan2(rty, rtx) * 180 / Math.PI;

      C.el.setAttribute('x', C.x);
      C.el.setAttribute('y', C.y);
      C.el.setAttribute('transform', 'rotate(' + ang + ',' + C.x + ',' + C.y + ')');
      C.el.style.opacity = 0.9;
    }
  };

  function openPage(yarn) {
    isPageOpen = true;
    yarn.transitioning = true;
    overlay.style.backgroundColor = yarn.color;

    if (typeof gsap === 'undefined') {
      window.location.href = yarn.url;
      return;
    }

    var tl = gsap.timeline();
    tl.to(yarn.points, {
      currentY: yarn.baseY,
      currentX: function (i, t) { return t.x; },
      duration: 0.5,
      ease: 'back.out(1.5)'
    }, 0);

    tl.to(yarn.pathEl, {
      attr: { 'stroke-width': yarn.sw * 0.35 },
      duration: 0.5,
      ease: 'power2.out'
    }, 0);

    tl.to(overlay, {
      x: '0%',
      duration: 1.0,
      ease: 'power4.inOut'
    }, 0.2);

    tl.call(function () { window.location.href = yarn.url; }, null, 1.3);
  }

  function build() {
    yarnGroup.innerHTML = '';
    textGroup.innerHTML = '';
    yarns = [];
    W = window.innerWidth;
    H = window.innerHeight;
    canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    for (var i = 0; i < DATA.length; i++) {
      yarns.push(new Yarn(DATA[i]));
    }

    lastTs = 0;
  }

  function loop(ts) {
    var dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
    lastTs = ts;
    dt = clamp(dt, 1 / 120, 1 / 20);

    for (var i = 0; i < yarns.length; i++) {
      yarns[i].updatePath();
      yarns[i].updateLetters(dt);
    }

    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', build);
  build();
  requestAnimationFrame(loop);
})();
