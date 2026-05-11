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
    { word: 'Archive',    color: '#ffccc3', sw: 55, yOff: 0.2,  url: 'archive.html' },
    { word: 'Shop',       color: '#e34234', sw: 42, yOff: 0.42, url: 'shop.html' },
    { word: 'Workshops',  color: '#ffeb53', sw: 48, yOff: 0.66, url: 'workshops.html' },
    { word: 'Newsletter', color: '#cad5d8', sw: 40, yOff: 0.86, url: 'newsletter.html' }
  ];

  var yarns = [];
  var isPageOpen = false;
  var lastTs = 0;
  var fixedRandomWidths = null;

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

  function normalize(x, y) {
    var len = Math.sqrt(x * x + y * y) || 1;
    return { x: x / len, y: y / len };
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
        speed: (0.004 + Math.random() * 0.008) * 2.0 * (isMobile ? 0.75 : 1.0),
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

    // Mobile drag state
    this.dragActive = false;
    this.dragPrimed = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragTargetX = 0;
    this.dragTargetY = 0;
    // Per-point spring offsets for pluck-and-release
    this.dragOffsets = [];
    for (var di = 0; di < this.points.length; di++) {
      this.dragOffsets.push({ y: 0, vy: 0 });
    }

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

    if (isMobile) {
      this.hitPathEl.addEventListener('touchstart', function (e) {
        if (isPageOpen) return;
        var touch = e.touches[0];
        var svgRect = svg.getBoundingClientRect();
        var scaleX = W / svgRect.width;
        var scaleY = H / svgRect.height;
        var tx = (touch.clientX - svgRect.left) * scaleX;
        var ty = (touch.clientY - svgRect.top) * scaleY;
        self.dragPrimed = true;
        self.dragActive = false;
        self.dragStartX = tx;
        self.dragStartY = ty;
        self.dragTargetX = tx;
        self.dragTargetY = ty;
      }, { passive: false });

      var onTouchMove = function (e) {
        if (!self.dragPrimed && !self.dragActive) return;
        var touch = e.touches[0];
        var svgRect = svg.getBoundingClientRect();
        var scaleX = W / svgRect.width;
        var scaleY = H / svgRect.height;
        var tx = (touch.clientX - svgRect.left) * scaleX;
        var ty = (touch.clientY - svgRect.top) * scaleY;

        // Activate drag only after moving past threshold (so taps still work)
        if (!self.dragActive && self.dragPrimed) {
          var dx0 = tx - self.dragStartX;
          var dy0 = ty - self.dragStartY;
          if (Math.sqrt(dx0 * dx0 + dy0 * dy0) >= 12) {
            self.dragActive = true;
          } else {
            return;
          }
        }
        e.preventDefault();
        self.dragTargetX = tx;
        self.dragTargetY = ty;
      };

      var onTouchEnd = function () {
        // Tap (no drag) → navigate
        if (self.dragPrimed && !self.dragActive && !isPageOpen) {
          openPage(self);
        }
        self.dragPrimed = false;
        self.dragActive = false;
        // Offsets spring back naturally in updatePath via damped oscillation.
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }
  };

  Yarn.prototype._buildLetters = function () {
    var pathLen = this.pathEl.getTotalLength() || W;
    var letterSize = isMobile ? this.renderSw * 0.75 : this.renderSw * 0.7;
    var letterR = letterSize * 0.42;
    var maxN = this.renderSw * 0.5 - letterR; // fallback; overridden by measurement below
    var visualCenterOffset = 0; // offset to align text visual center with (wx, wy)

    for (var k = 0; k < this.letters.length; k++) {
      if (this.letters[k].el.parentNode) this.letters[k].el.parentNode.removeChild(this.letters[k].el);
    }
    this.letters = [];

    // Measure actual letter visual bounds for precise yarn-edge alignment.
    // dominant-baseline:central may not center visually symmetric — measure and correct.
    var mEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    mEl.textContent = 'H';
    mEl.setAttribute('class', 'yarn-text');
    mEl.style.fontSize = letterSize + 'px';
    mEl.setAttribute('x', '0');
    mEl.setAttribute('y', '0');
    this.groupEl.appendChild(mEl);
    var mBbox = mEl.getBBox();
    if (mBbox.height > 0) {
      visualCenterOffset = mBbox.y + mBbox.height * 0.5;
      maxN = Math.max(0, this.renderSw * 0.5 - mBbox.height * 0.5);
    }
    this.groupEl.removeChild(mEl);

    var tempLetters = [];
    var wordGap = letterSize * 0.12;
    var wordWidth = 0;

    for (var c = 0; c < this.word.length; c++) {
      var ch = this.word[c];
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.textContent = ch;
      el.setAttribute('class', 'yarn-text');
      el.style.fontSize = letterSize + 'px';
      this.groupEl.appendChild(el);

      var bbox = el.getBBox();
      var letterWidth = Math.max(letterSize * 0.42, bbox.width);
      tempLetters.push({
        el: el,
        width: letterWidth,
        halfW: Math.max(2, letterWidth * 0.5),
        halfH: Math.max(2, bbox.height * 0.5)
      });
      wordWidth += letterWidth;
      if (c < this.word.length - 1) wordWidth += wordGap;
    }

    var uniformGap = pathLen / tempLetters.length;
    var clusterStartU = wrapArc(pathLen * 0.5 - wordWidth * 0.5, pathLen);
    var clusterCursorU = clusterStartU;

    for (var i = 0; i < tempLetters.length; i++) {
      var letter = tempLetters[i];
      var hoverU = wrapArc(clusterCursorU + letter.width * 0.5, pathLen);
      var defaultU = wrapArc((i + 0.5) * uniformGap, pathLen);
      var pt = this.pathEl.getPointAtLength(defaultU);

      this.letters.push({
        el: letter.el,
        u: defaultU,
        vU: 0,
        n: 0,
        vN: 0,
        wx: pt.x,
        wy: pt.y,
        tx: 1, ty: 0,
        nx: 0, ny: 1,
        pax: NaN, pay: NaN,
        letterR: letterR,
        halfW: letter.halfW,
        halfH: letter.halfH,
        visualCenterOffset: visualCenterOffset,
        maxN: maxN,
        hoverU: hoverU,
        defaultU: defaultU
      });

      clusterCursorU += letter.width + wordGap;
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

  Yarn.prototype.updatePath = function (dt) {
    dt = dt || (1 / 60);
    var wScale = this.transitioning ? 0 : (1 - this.hoverAmt);
    for (var i = 0; i < this.points.length; i++) {
      var p = this.points[i];
      p.angle += p.speed;
      p.currentX = p.x + Math.cos(p.angle) * p.ampX * wScale;
      p.currentY = p.y + Math.sin(p.angle) * p.ampY * wScale;
      // On hover, lerp toward baseY for a perfectly horizontal line
      p.currentY = p.currentY + (this.baseY - p.currentY) * this.hoverAmt;
    }
    this.points[0].currentX = 0;
    this.points[this.points.length - 1].currentX = W;

    // Mobile drag: pluck-and-release with damped spring recovery.
    if (isMobile) {
      for (var oi = 0; oi < this.points.length; oi++) {
        var op = this.points[oi];
        var oo = this.dragOffsets[oi];
        if (this.dragActive) {
          // Influence falloff: quadratic distance from finger
          var dist = Math.abs(op.x - this.dragTargetX);
          var maxDist = W * 0.42;
          var influence = Math.max(0, 1 - dist / maxDist);
          influence = influence * influence;
          oo.y = (this.dragTargetY - op.currentY) * influence;
          oo.vy = 0;
        } else {
          // Damped spring recovery (underdamped → satisfying overshoot)
          var springK = 200;
          var damping = 14;
          oo.vy += (-springK * oo.y - damping * oo.vy) * dt;
          oo.y += oo.vy * dt;
          if (Math.abs(oo.y) < 0.3 && Math.abs(oo.vy) < 0.3) { oo.y = 0; oo.vy = 0; }
        }
        op.currentY += oo.y;
      }
    }

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
    // Keep visible thickness fixed after initial render.
    var currentSw = this.renderSw;
    this.pathEl.setAttribute('stroke-width', currentSw);
    // Keep pointer hit area exactly on the visible yarn stroke.
    this.hitPathEl.setAttribute('stroke-width', currentSw);
  };

  Yarn.prototype.updateLetters = function (dt) {
    if (!this.letters.length) return;
    var pathLen = this.pathEl.getTotalLength();
    if (!pathLen) return;

    // --- Path sample cache: O(1) lookups replace expensive getPointAtLength ---
    var SAMPLES = 80;
    if (!this._pc) {
      this._pc = [];
      for (var si = 0; si <= SAMPLES; si++) this._pc.push({ x: 0, y: 0 });
    }
    for (var si = 0; si <= SAMPLES; si++) {
      var spt = this.pathEl.getPointAtLength(si / SAMPLES * pathLen);
      this._pc[si].x = spt.x;
      this._pc[si].y = spt.y;
    }
    var pc = this._pc;

    function fastTN(u) {
      var frac = u / pathLen;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      var t = frac * SAMPLES;
      var ti = t | 0;
      if (ti >= SAMPLES) ti = SAMPLES - 1;
      var tf = t - ti;
      var p0 = pc[ti], p1 = pc[ti + 1];
      var ax = p0.x + (p1.x - p0.x) * tf;
      var ay = p0.y + (p1.y - p0.y) * tf;
      var dx = p1.x - p0.x, dy = p1.y - p0.y;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      return { ax: ax, ay: ay, tx: dx / l, ty: dy / l, nx: -dy / l, ny: dx / l };
    }

    var count = this.letters.length;
    var speedScale = isMobile ? 0.75 : 1.0;
    var maxUSpeed = 140 * speedScale;
    var maxNSpeed = 160 * speedScale;
    var restitution = 0.7;
    var wallKickSpeed = 18 * speedScale;
    var nearWallBand = 0.88;
    var nearWallCenterPull = 48;

    // 0a) PC hover/unhover springs.
    if (canHover && !isMobile) {
      if (this.hovered) {
        // Hover: spring to word-grouped positions (2n/0.7n)
        for (var gi = 0; gi < count; gi++) {
          var GL = this.letters[gi];
          var du = shortestArcDelta(GL.u, GL.hoverU, pathLen);
          GL.vU += du * 28 * dt;
          GL.vU *= 0.82;
          GL.vN += (-GL.n) * 20 * dt;
          GL.vN *= 0.86;
        }
      } else {
        // Unhover: gently spring back to uniform spacing
        for (var gi2 = 0; gi2 < count; gi2++) {
          var GL2 = this.letters[gi2];
          var du2 = shortestArcDelta(GL2.u, GL2.defaultU, pathLen);
          GL2.vU += du2 * 12 * dt;
          GL2.vU *= 0.90;
        }
      }
    }

    // 0b) Mobile drag: gather letters toward finger position with tight spacing.
    if (isMobile) {
      if (this.dragActive) {
        // Find closest arc position to finger via path cache
        var fingerX = this.dragTargetX;
        var fingerY = this.dragTargetY;
        var bestDist = Infinity, fingerU = pathLen * 0.5;
        for (var fi = 0; fi <= SAMPLES; fi++) {
          var fpx = pc[fi].x - fingerX, fpy = pc[fi].y - fingerY;
          var fd2 = fpx * fpx + fpy * fpy;
          if (fd2 < bestDist) { bestDist = fd2; fingerU = fi / SAMPLES * pathLen; }
        }

        // Tight word-grouped layout centered at finger position
        var wordLen = this.word.length;
        var repeatsM = count / wordLen;
        var tightLetterGap = 0.5;  // tighter than 0.7n
        var tightWordGap = 1.2;    // tighter than 2n
        var tightBlock = wordLen * tightLetterGap + tightWordGap;
        // Measure in path units using average letter size
        var avgLetterR = this.letters[0].letterR;
        var tightUnit = avgLetterR * 2.2;
        var totalSpan = repeatsM * tightBlock * tightUnit;
        var startU = fingerU - totalSpan * 0.5;

        for (var mi = 0; mi < count; mi++) {
          var ML = this.letters[mi];
          var mGroup = Math.floor(mi / wordLen);
          var mChar = mi % wordLen;
          var targetU = startU + (mGroup * tightBlock + mChar * tightLetterGap + tightWordGap * 0.5) * tightUnit;
          targetU = clamp(targetU, 0, pathLen);

          var mdu = shortestArcDelta(ML.u, targetU, pathLen);
          ML.vU += mdu * 32 * dt;
          ML.vU *= 0.78;
          // Pull to center line (n=0)
          ML.vN += (-ML.n) * 24 * dt;
          ML.vN *= 0.82;
        }
      }
    }

    // 1) Yarn wall coupling + frame rotation (curvature transfers vN↔vU naturally).
    for (var i = 0; i < count; i++) {
      var B = this.letters[i];
      var tnB = fastTN(clamp(B.u, 0, pathLen));

      if (!isNaN(B.pax)) {
        // Frame rotation: as yarn curves, local frame rotates → naturally mixes vN into vU.
        var cosD = B.tx * tnB.tx + B.ty * tnB.ty;
        var sinD = B.tx * tnB.ty - B.ty * tnB.tx;
        var rVU = B.vU * cosD + B.vN * sinD;
        var rVN = -B.vU * sinD + B.vN * cosD;
        B.vU = rVU;
        B.vN = rVN;

        // Normal wall velocity injection (yarn motion pushes letters).
        var dax = tnB.ax - B.pax;
        var day = tnB.ay - B.pay;
        var invDt = 1 / Math.max(dt, 1e-6);
        B.vN += (dax * tnB.nx + day * tnB.ny) * invDt * 0.18;
        // PC: tangential coupling lets yarn horizontal wave motion drive letters sideways.
        if (!isMobile) {
          B.vU += (dax * tnB.tx + day * tnB.ty) * invDt * 0.08;
        }
      }

      B.tx = tnB.tx; B.ty = tnB.ty;
      B.nx = tnB.nx; B.ny = tnB.ny;
      B.pax = tnB.ax;
      B.pay = tnB.ay;
    }

    // 2) Integrate and handle elastic yarn boundary response.
    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      L.vU = clamp(L.vU, -maxUSpeed, maxUSpeed);
      L.vN = clamp(L.vN, -maxNSpeed, maxNSpeed);

      L.u = clamp(L.u + L.vU * dt, 0, pathLen);
      L.n += L.vN * dt;

      // Reflect at arc endpoints instead of wrapping.
      if (L.u <= 0) { L.u = 0; if (L.vU < 0) L.vU *= -restitution; }
      if (L.u >= pathLen) { L.u = pathLen; if (L.vU > 0) L.vU *= -restitution; }

      var nearRatio = Math.abs(L.n) / Math.max(1e-6, L.maxN);
      if (nearRatio > nearWallBand) {
        L.vN += (L.n > 0 ? -1 : 1) * nearWallCenterPull * (nearRatio - nearWallBand) * dt;
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

    // 3) Compute world pose.
    for (var p = 0; p < count; p++) {
      var P = this.letters[p];
      var tnP = fastTN(clamp(P.u, 0, pathLen));
      P.tx = tnP.tx; P.ty = tnP.ty;
      P.nx = tnP.nx; P.ny = tnP.ny;
      P.wx = tnP.ax + tnP.nx * P.n;
      P.wy = tnP.ay + tnP.ny * P.n;
    }

    // 4) Letter-letter collision (single pass, neighborhood).
    var order = [];
    for (var oi = 0; oi < count; oi++) order.push(oi);
    order.sort(function (ia, ib) { return this.letters[ia].u - this.letters[ib].u; }.bind(this));

    var neighborWindow = isMobile ? 8 : 6;
    var maxArcCheck = 100;

    for (var ord = 0; ord < count; ord++) {
      var a = order[ord];
      var A = this.letters[a];

      for (var step = 1; step <= neighborWindow && step < count; step++) {
        var ordB = (ord + step) % count;
        var b = order[ordB];
        var B2 = this.letters[b];

        var arcDelta = B2.u - A.u;
        if (arcDelta < 0) arcDelta += pathLen;
        if (arcDelta > maxArcCheck) break;

        var cdx = B2.wx - A.wx, cdy = B2.wy - A.wy;
        var axisT = normalize(A.tx + B2.tx, A.ty + B2.ty);
        var axisTx = axisT.x, axisTy = axisT.y;
        var axisNx = -axisTy, axisNy = axisTx;

        var sepT = cdx * axisTx + cdy * axisTy;
        var sepN = cdx * axisNx + cdy * axisNy;
        var limitT = A.halfW + B2.halfW, limitN = A.halfH + B2.halfH;
        if (Math.abs(sepT) >= limitT || Math.abs(sepN) >= limitN) continue;

        var penT = limitT - Math.abs(sepT), penN = limitN - Math.abs(sepN);
        var cnx, cny, pen;
        if (penT < penN) {
          cnx = sepT >= 0 ? axisTx : -axisTx;
          cny = sepT >= 0 ? axisTy : -axisTy;
          pen = penT;
        } else {
          cnx = sepN >= 0 ? axisNx : -axisNx;
          cny = sepN >= 0 ? axisNy : -axisNy;
          pen = penN;
        }

        var half = pen * 0.5;
        A.u = clamp(A.u - (cnx * half * A.tx + cny * half * A.ty), 0, pathLen);
        A.n = clamp(A.n - (cnx * half * A.nx + cny * half * A.ny), -A.maxN, A.maxN);
        B2.u = clamp(B2.u + (cnx * half * B2.tx + cny * half * B2.ty), 0, pathLen);
        B2.n = clamp(B2.n + (cnx * half * B2.nx + cny * half * B2.ny), -B2.maxN, B2.maxN);
        A.wx -= cnx * half; A.wy -= cny * half;
        B2.wx += cnx * half; B2.wy += cny * half;

        var aVx = A.tx * A.vU + A.nx * A.vN;
        var aVy = A.ty * A.vU + A.ny * A.vN;
        var bVx = B2.tx * B2.vU + B2.nx * B2.vN;
        var bVy = B2.ty * B2.vU + B2.ny * B2.vN;
        var relVn = (bVx - aVx) * cnx + (bVy - aVy) * cny;
        if (relVn < 0) {
          var impulse = -(1 + restitution) * relVn * 0.5;
          aVx -= impulse * cnx; aVy -= impulse * cny;
          bVx += impulse * cnx; bVy += impulse * cny;
          A.vU = aVx * A.tx + aVy * A.ty;
          A.vN = aVx * A.nx + aVy * A.ny;
          B2.vU = bVx * B2.tx + bVy * B2.ty;
          B2.vN = bVx * B2.nx + bVy * B2.ny;
        }
      }
    }

    // 5) Screen boundary collision (reuse stored pose).
    for (var w = 0; w < count; w++) {
      var S = this.letters[w];
      var minX = S.letterR, maxX = W - S.letterR;
      var corrX = 0;
      if (S.wx < minX) corrX = minX - S.wx;
      else if (S.wx > maxX) corrX = maxX - S.wx;
      if (!corrX) continue;

      S.u = clamp(S.u + corrX * S.tx, 0, pathLen);
      S.n = clamp(S.n + corrX * S.nx, -S.maxN, S.maxN);
      S.wx += corrX;

      var vx = S.tx * S.vU + S.nx * S.vN;
      var vy = S.ty * S.vU + S.ny * S.vN;
      var wallNx = corrX > 0 ? 1 : -1;
      var vAlongN = vx * wallNx;
      if (vAlongN < 0) {
        vx -= (1 + restitution) * vAlongN * wallNx;
      }
      S.vU = vx * S.tx + vy * S.ty;
      S.vN = vx * S.nx + vy * S.ny;
    }

    // 6) Render (use stored world pose — no extra path lookups).
    for (var r = 0; r < count; r++) {
      var C = this.letters[r];
      var ang = Math.atan2(C.ty, C.tx) * 180 / Math.PI;
      C.el.setAttribute('x', C.wx);
      C.el.setAttribute('y', C.wy - C.visualCenterOffset);
      C.el.setAttribute('transform', 'rotate(' + ang + ',' + C.wx + ',' + C.wy + ')');
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
    // Extend range for visible thickness variation.
    maxSw *= isMobile ? 1.4 : 1.8;
    if (!fixedRandomWidths || fixedRandomWidths.length !== DATA.length) {
      var minDiff = isMobile ? 8 : Math.max(8, (maxSw - minSw) / 4);
      fixedRandomWidths = createDistinctRandomWidths(DATA.length, minSw, maxSw, minDiff);
    }

    // Build Newsletter→Archive so Archive group is last in DOM = on top.
    // Within each group: path(behind) then letters(front).
    for (var i = DATA.length - 1; i >= 0; i--) {
      yarns.push(new Yarn({
        word: DATA[i].word,
        color: DATA[i].color,
        sw: fixedRandomWidths[i],
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
      yarns[i].updatePath(dt);
      yarns[i].updateLetters(dt);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', build);
  build();
  requestAnimationFrame(loop);
})();
