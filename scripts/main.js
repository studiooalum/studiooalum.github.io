/* ======================================================
   Studio OALUM – Yarn Menu
   Letters in yarn-local (u, n) coordinates, always inside
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

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function Yarn(cfg) {
    this.word = cfg.word.toUpperCase();
    this.color = cfg.color;
    this.sw = cfg.sw;
    this.baseY = H * cfg.yOff;
    this.url = cfg.url;

    // Yarn wave points
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
        speed: (0.004 + Math.random() * 0.008) * 3.0,  // 2x speed
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
    var letterR = canHover ? 8.5 : 7;
    var maxN = this.sw * 0.5 - letterR;

    for (var k = 0; k < this.letters.length; k++) {
      if (this.letters[k].el.parentNode) this.letters[k].el.parentNode.removeChild(this.letters[k].el);
    }
    this.letters = [];

    for (var i = 0; i < total; i++) {
      var ch = this.word[i % this.word.length];
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.textContent = ch;
      el.setAttribute('class', 'yarn-text');
      textGroup.appendChild(el);

      // u: arc position (fixed reference)
      var u = i * spacing + spacing * 0.5;
      // Snap anchor coords
      var pt = this.pathEl.getPointAtLength(clamp(u, 0, pathLen));

      this.letters.push({
        el: el,
        u: u,           // arc anchor — stays fixed (read-only reference for rotation)
        n: (Math.random() - 0.5) * maxN * 0.8,  // normal offset, starts near center
        vN: 0,          // normal velocity
        // world coords cache (set in render)
        wx: pt.x,
        wy: pt.y,
        // previous anchor world position (to compute yarn motion)
        pax: pt.x,
        pay: pt.y,
        letterR: letterR,
        maxN: maxN
      });
    }
  };

  // Get tangent & normal at arc position u on pathEl
  Yarn.prototype._getTN = function (u, pathLen) {
    var s  = clamp(u, 0, pathLen);
    var s2 = clamp(u + 1.5, 0, pathLen);
    var p  = this.pathEl.getPointAtLength(s);
    var p2 = this.pathEl.getPointAtLength(s2);
    var tdx = p2.x - p.x, tdy = p2.y - p.y;
    var tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    var tx = tdx / tl, ty = tdy / tl;
    return { ax: p.x, ay: p.y, tx: tx, ty: ty, nx: -ty, ny: tx };
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
      var x1 = pts[j].currentX, y1 = pts[j].currentY;
      var x2 = pts[j+1].currentX, y2 = pts[j+1].currentY;
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
    var damping = Math.exp(-dt / 0.5);
    var maxSpeed = 400;

    // ── 1. Yarn motion → normal impulse ──────────────────────
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      var tn = this._getTN(L.u, pathLen);

      // How much did the anchor point move along the normal axis?
      var dax = tn.ax - L.pax;
      var day = tn.ay - L.pay;
      var dnorm = dax * tn.nx + day * tn.ny;  // displacement along normal

      // Transfer that as velocity impulse (restitution-like)
      L.vN += dnorm / dt * 0.6;

      // Save anchor for next frame
      L.pax = tn.ax;
      L.pay = tn.ay;
    }

    // ── 2. Integrate vN → n ──────────────────────────────────
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      // Clamp speed
      if (L.vN > maxSpeed) L.vN = maxSpeed;
      if (L.vN < -maxSpeed) L.vN = -maxSpeed;
      L.n += L.vN * dt;
      L.vN *= damping;

      // Hard boundary: bounce off yarn edge
      if (L.n > L.maxN) {
        L.n = L.maxN;
        if (L.vN > 0) L.vN *= -0.35;
      } else if (L.n < -L.maxN) {
        L.n = -L.maxN;
        if (L.vN < 0) L.vN *= -0.35;
      }
    }

    // ── 3. Compute world positions for collision ──────────────
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      var tn = this._getTN(L.u, pathLen);
      L.wx = tn.ax + tn.nx * L.n;
      L.wy = tn.ay + tn.ny * L.n;
    }

    // ── 4. Letter–letter collision (resolve in n) ─────────────
    var minGap = (canHover ? 8.5 : 7) * 2;
    for (var a = 0; a < count; a++) {
      for (var b = a + 1; b < count; b++) {
        var A = this.letters[a];
        var B = this.letters[b];
        var cdx = B.wx - A.wx;
        var cdy = B.wy - A.wy;
        var cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 0.001;
        if (cdist >= minGap) continue;

        var pen = (minGap - cdist) * 0.5;
        var cnx = cdx / cdist, cny = cdy / cdist;

        // Collision normal projected onto each letter's yarn normal
        var tnA = this._getTN(A.u, pathLen);
        var tnB = this._getTN(B.u, pathLen);
        var projA = cnx * tnA.nx + cny * tnA.ny;
        var projB = cnx * tnB.nx + cny * tnB.ny;

        // Position correction in n
        A.n -= pen * projA;
        B.n += pen * projB;

        // Velocity exchange
        var relVn = (B.vN * projB) - (A.vN * projA);
        if (relVn < 0) {
          var imp = relVn * 0.5;
          A.vN += imp * projA;
          B.vN -= imp * projB;
        }

        // Re-clamp n
        A.n = clamp(A.n, -A.maxN, A.maxN);
        B.n = clamp(B.n, -B.maxN, B.maxN);
      }
    }

    // ── 5. Render ─────────────────────────────────────────────
    for (var r = 0; r < count; r++) {
      var C = this.letters[r];
      var tn = this._getTN(C.u, pathLen);
      var wx = tn.ax + tn.nx * C.n;
      var wy = tn.ay + tn.ny * C.n;
      var ang = Math.atan2(tn.ty, tn.tx) * 180 / Math.PI;

      C.el.setAttribute('x', wx);
      C.el.setAttribute('y', wy);
      C.el.setAttribute('transform', 'rotate(' + ang + ',' + wx + ',' + wy + ')');
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
    tl.to(yarn.points, { currentY: yarn.baseY, currentX: function (i, t) { return t.x; }, duration: 0.5, ease: 'back.out(1.5)' }, 0);
    tl.to(yarn.pathEl, { attr: { 'stroke-width': yarn.sw * 0.35 }, duration: 0.5, ease: 'power2.out' }, 0);
    tl.to(overlay, { x: '0%', duration: 1.0, ease: 'power4.inOut' }, 0.2);
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
    for (var i = 0; i < DATA.length; i++) yarns.push(new Yarn(DATA[i]));
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
