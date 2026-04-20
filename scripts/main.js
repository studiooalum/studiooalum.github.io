/* ======================================================
   Studio OALUM – Yarn Menu
   Letters in yarn-local (u, n) coordinates, always inside
====================================================== */
(function () {
  'use strict';

  var svg = document.getElementById('svg-container');
  var yarnGroup = document.getElementById('yarn-group');
  var overlay = document.getElementById('page-overlay');

  var W = window.innerWidth;
  var H = window.innerHeight;
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
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
  function wrapArc(u, len) {
    if (len <= 0) return 0;
    u = u % len;
    if (u < 0) u += len;
    return u;
  }

  function shortestArcDelta(fromU, toU, len) {
    var d = toU - fromU;
    if (d > len * 0.5) d -= len;
    if (d < -len * 0.5) d += len;
    return d;
  }

  function randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function createDistinctRandomWidths(count, min, max, minDiff) {
    var widths = [];
    var attempts = 0;
    while (widths.length < count && attempts < 400) {
      var candidate = randomInRange(min, max);
      var uniqueEnough = true;
      for (var i = 0; i < widths.length; i++) {
        if (Math.abs(widths[i] - candidate) < minDiff) {
          uniqueEnough = false;
          break;
        }
      }
      if (uniqueEnough) widths.push(candidate);
      attempts++;
    }

    // Fallback for very tight ranges.
    while (widths.length < count) {
      var t = count === 1 ? 0.5 : widths.length / (count - 1);
      widths.push(min + (max - min) * t);
    }
    return widths;
  }

  function Yarn(cfg) {
    this.word = cfg.word.toUpperCase();
    this.color = cfg.color;
    this.sw = cfg.sw;
    // PC: previous 1.15x thickness, then +30% requested => 1.15 * 1.3 = 1.495
    this.renderSw = isMobile ? this.sw : this.sw * 1.495;
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
        speed: (0.004 + Math.random() * 0.008) * (isMobile ? 3.0 : 15.0),
        ampX: edge ? 2 : 8 + Math.random() * 12,
        ampY: edge ? 10 : 16 + Math.random() * 24
      });
    }

    // Each yarn gets its own <g>: path first (behind), letters on top.
    // Yarn groups are appended Newsletter→Archive so Archive is last = on top.
    this.groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    yarnGroup.appendChild(this.groupEl);

    this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.pathEl.setAttribute('class', 'yarn');
    this.pathEl.setAttribute('stroke', this.color);
    this.pathEl.setAttribute('stroke-width', this.renderSw);
    this.groupEl.appendChild(this.pathEl);

    this.hitPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.hitPathEl.setAttribute('fill', 'none');
    this.hitPathEl.setAttribute('stroke', 'transparent');
    this.hitPathEl.setAttribute('stroke-width', this.renderSw);
    this.hitPathEl.style.cursor = 'pointer';
    this.hitPathEl.style.pointerEvents = 'stroke';
    this.groupEl.appendChild(this.hitPathEl);

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
  };

  Yarn.prototype._buildLetters = function () {
    var pathLen = this.pathEl.getTotalLength() || W;
    var baseCount = Math.max(this.word.length * 2, Math.round(pathLen / 22));
    var densityScale = isMobile ? 0.7 : 0.35;
    var targetCount = Math.max(this.word.length, Math.round(baseCount * densityScale));
    var repeats = isMobile ? 1 : Math.max(1, Math.round(targetCount / this.word.length));
    var intraUnit = 1;
    var interUnit = 2;
    var unit = pathLen / (repeats * (this.word.length * intraUnit + interUnit));
    var letterSize = isMobile ? this.renderSw * 0.75 : 33 * 1.3;
    var letterR = letterSize * 0.42;
    var maxN = this.renderSw * 0.5 - letterR;

    for (var k = 0; k < this.letters.length; k++) {
      if (this.letters[k].el.parentNode) this.letters[k].el.parentNode.removeChild(this.letters[k].el);
    }
    this.letters = [];

    for (var g = 0; g < repeats; g++) {
      var groupStart = g * (this.word.length * intraUnit + interUnit) * unit;
      for (var c = 0; c < this.word.length; c++) {
        var ch = this.word[c];
        var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.textContent = ch;
        el.setAttribute('class', 'yarn-text');
        el.style.fontSize = letterSize + 'px';
        this.groupEl.appendChild(el);

        // Hover target: word gap 2n, letter gap 0.7n
        var hoverU = groupStart + (c * 0.7 + 0.35) * unit;
        hoverU = wrapArc(hoverU, pathLen);

        // Default first layout: centered on yarn (n=0), ordered along arc.
        var u = hoverU;
        var pt = this.pathEl.getPointAtLength(u);

        this.letters.push({
          el: el,
          u: u,
          vU: 0,
          n: 0,
          vN: 0,
          wx: pt.x,
          wy: pt.y,
          tx: 1,
          ty: 0,
          nx: 0,
          ny: 1,
          pax: NaN,
          pay: NaN,
          letterR: letterR,
          maxN: maxN,
          hoverU: hoverU
        });
      }
    }
  };

  // Get tangent & normal at arc position u on pathEl
  Yarn.prototype._getTN = function (u, pathLen) {
    var s = wrapArc(u, pathLen);
    var s2 = s + 1.5;
    if (s2 > pathLen) s2 = s - 1.5;
    if (s2 < 0) s2 = s + 1.5;
    var p  = this.pathEl.getPointAtLength(s);
    var p2 = this.pathEl.getPointAtLength(s2);
    var tdx = p2.x - p.x, tdy = p2.y - p.y;
    var tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    var tx = tdx / tl, ty = tdy / tl;
    return { ax: p.x, ay: p.y, tx: tx, ty: ty, nx: -ty, ny: tx };
  };

  Yarn.prototype.updatePath = function () {
    var wScale = this.transitioning ? 0 : (1 - this.hoverAmt * 0.6);
    for (var i = 0; i < this.points.length; i++) {
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
    var currentSw = this.renderSw * (1 + this.hoverAmt * 0.15);
    this.pathEl.setAttribute('stroke-width', currentSw);
    // Keep pointer hit area exactly on the visible yarn stroke.
    this.hitPathEl.setAttribute('stroke-width', currentSw);
  };

  Yarn.prototype.updateLetters = function (dt) {
    if (!this.letters.length) return;
    var pathLen = this.pathEl.getTotalLength();
    if (!pathLen) return;

    var count = this.letters.length;
    var maxUSpeed = 260;
    var maxNSpeed = 300;
    var restitution = 0.7;
    var wallKickSpeed = 34;
    var nearWallBand = 0.88;
    var nearWallCenterPull = 48;

    // 1) Hover on PC: gather into centered word layout (2n / 0.7n)
    if (canHover && this.hovered && !isMobile) {
      var gatherK = 26;
      var gatherDamp = 0.84;
      for (var g = 0; g < count; g++) {
        var G = this.letters[g];
        var du = shortestArcDelta(G.u, G.hoverU, pathLen);
        G.vU += du * gatherK * dt;
        G.vU *= gatherDamp;
        G.vN += (-G.n) * 22 * dt;
        G.vN *= 0.86;
      }
    }

    // 2) Yarn boundary interaction only (no direct tangent velocity injection).
    for (var i = 0; i < count; i++) {
      var B = this.letters[i];
      var tnB = this._getTN(B.u, pathLen);

      if (!isNaN(B.pax)) {
        var dax = tnB.ax - B.pax;
        var day = tnB.ay - B.pay;
        var wallVn = (dax * tnB.nx + day * tnB.ny) / Math.max(dt, 1e-6);
        B.vN += wallVn * 0.16;
      }

      B.pax = tnB.ax;
      B.pay = tnB.ay;
    }

    // 3) Integrate and handle elastic yarn boundary response.
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];

      if (L.vU > maxUSpeed) L.vU = maxUSpeed;
      if (L.vU < -maxUSpeed) L.vU = -maxUSpeed;
      if (L.vN > maxNSpeed) L.vN = maxNSpeed;
      if (L.vN < -maxNSpeed) L.vN = -maxNSpeed;

      L.u = wrapArc(L.u + L.vU * dt, pathLen);
      L.n += L.vN * dt;

      // Anti-stick: add a weak center pull only near the yarn walls.
      var nearRatio = Math.abs(L.n) / Math.max(1e-6, L.maxN);
      if (nearRatio > nearWallBand) {
        var towardCenter = L.n > 0 ? -1 : 1;
        L.vN += towardCenter * nearWallCenterPull * (nearRatio - nearWallBand) * dt;
      }

      if (L.n > L.maxN) {
        L.n = L.maxN;
        if (L.vN > 0) L.vN *= -restitution;
        if (Math.abs(L.vN) < wallKickSpeed) L.vN = -wallKickSpeed;
      } else if (L.n < -L.maxN) {
        L.n = -L.maxN;
        if (L.vN < 0) L.vN *= -restitution;
        if (Math.abs(L.vN) < wallKickSpeed) L.vN = wallKickSpeed;
      }
    }

    // 4) Compute world pose.
    for (var p = 0; p < count; p++) {
      var P = this.letters[p];
      var tnP = this._getTN(P.u, pathLen);
      P.tx = tnP.tx;
      P.ty = tnP.ty;
      P.nx = tnP.nx;
      P.ny = tnP.ny;
      P.wx = tnP.ax + tnP.nx * P.n;
      P.wy = tnP.ay + tnP.ny * P.n;
    }

    // 5) Collision (optimized neighborhood pairs) to reduce PC latency.
    var order = [];
    for (var oi = 0; oi < count; oi++) order.push(oi);
    order.sort(function (ia, ib) { return this.letters[ia].u - this.letters[ib].u; }.bind(this));

    var neighborWindow = isMobile ? 10 : 8;
    var maxArcCheck = 120;

    for (var pass = 0; pass < 2; pass++) {
      for (var ord = 0; ord < count; ord++) {
        var a = order[ord];
        var A = this.letters[a];

        for (var step = 1; step <= neighborWindow && step < count; step++) {
          var ordB = (ord + step) % count;
          var b = order[ordB];
          var B = this.letters[b];

          var arcDelta = B.u - A.u;
          if (arcDelta < 0) arcDelta += pathLen;
          if (arcDelta > maxArcCheck) break;

          var cdx = B.wx - A.wx;
          var cdy = B.wy - A.wy;
          var cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 0.001;
          var minGap = (A.letterR + B.letterR);
          if (cdist >= minGap) continue;

          var cnx = cdx / cdist;
          var cny = cdy / cdist;
          var pen = minGap - cdist;

          var corrAx = -cnx * pen * 0.5;
          var corrAy = -cny * pen * 0.5;
          var corrBx = cnx * pen * 0.5;
          var corrBy = cny * pen * 0.5;

          A.u = wrapArc(A.u + corrAx * A.tx + corrAy * A.ty, pathLen);
          A.n = clamp(A.n + corrAx * A.nx + corrAy * A.ny, -A.maxN, A.maxN);
          B.u = wrapArc(B.u + corrBx * B.tx + corrBy * B.ty, pathLen);
          B.n = clamp(B.n + corrBx * B.nx + corrBy * B.ny, -B.maxN, B.maxN);

          var aVx = A.tx * A.vU + A.nx * A.vN;
          var aVy = A.ty * A.vU + A.ny * A.vN;
          var bVx = B.tx * B.vU + B.nx * B.vN;
          var bVy = B.ty * B.vU + B.ny * B.vN;

          var relVx = bVx - aVx;
          var relVy = bVy - aVy;
          var relVn = relVx * cnx + relVy * cny;
          if (relVn < 0) {
            var impulse = -(1 + restitution) * relVn * 0.5;
            aVx -= impulse * cnx;
            aVy -= impulse * cny;
            bVx += impulse * cnx;
            bVy += impulse * cny;

            A.vU = aVx * A.tx + aVy * A.ty;
            A.vN = aVx * A.nx + aVy * A.ny;
            B.vU = bVx * B.tx + bVy * B.ty;
            B.vN = bVx * B.nx + bVy * B.ny;
          }

          var tnA = this._getTN(A.u, pathLen);
          A.tx = tnA.tx;
          A.ty = tnA.ty;
          A.nx = tnA.nx;
          A.ny = tnA.ny;
          A.wx = tnA.ax + tnA.nx * A.n;
          A.wy = tnA.ay + tnA.ny * A.n;

          var tnB = this._getTN(B.u, pathLen);
          B.tx = tnB.tx;
          B.ty = tnB.ty;
          B.nx = tnB.nx;
          B.ny = tnB.ny;
          B.wx = tnB.ax + tnB.nx * B.n;
          B.wy = tnB.ay + tnB.ny * B.n;
        }
      }
    }

    // 6) Render
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
    tl.to(yarn.pathEl, { attr: { 'stroke-width': yarn.renderSw * 0.35 }, duration: 0.5, ease: 'power2.out' }, 0);
    tl.to(overlay, { x: '0%', duration: 1.0, ease: 'power4.inOut' }, 0.2);
    tl.call(function () { window.location.href = yarn.url; }, null, 1.3);
  }

  function build() {
    yarnGroup.innerHTML = '';
    yarns = [];
    W = window.innerWidth;
    H = window.innerHeight;
    isMobile = window.matchMedia('(max-width: 768px)').matches;
    canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var minSw = Infinity;
    var maxSw = -Infinity;
    for (var j = 0; j < DATA.length; j++) {
      if (DATA[j].sw < minSw) minSw = DATA[j].sw;
      if (DATA[j].sw > maxSw) maxSw = DATA[j].sw;
    }
    var randomWidths = createDistinctRandomWidths(DATA.length, minSw, maxSw, 1.2);

    // Build Newsletter→Archive so Archive group is last in DOM = on top.
    // Within each group: path(behind) then letters(front).
    for (var i = DATA.length - 1; i >= 0; i--) {
      yarns.push(new Yarn({
        word: DATA[i].word,
        color: DATA[i].color,
        sw: randomWidths[i],
        yOff: DATA[i].yOff,
        url: DATA[i].url
      }));
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
