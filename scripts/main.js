/* ======================================================
   Studio OALUM – Yarn Menu
   Physics-based letters inside moving yarns
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
    this.lastPathLen = 0;

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

    this.letters = [];

    for (var i = 0; i < total; i++) {
      var ch = this.word[i % this.word.length];
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.textContent = ch;
      el.setAttribute('class', 'yarn-text');
      textGroup.appendChild(el);

      this.letters.push({
        el: el,
        u: i * spacing,
        vU: 0,
        n: (Math.random() - 0.5) * this.sw * 0.25,
        vN: (Math.random() - 0.5) * 2,
        x: 0,
        y: 0,
        tx: 1,
        ty: 0,
        nx: 0,
        ny: 1,
        r: canHover ? 8.5 : 7
      });
    }

    this.lastPathLen = pathLen;
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

    if (this.lastPathLen > 0 && Math.abs(pathLen - this.lastPathLen) > 0.001) {
      var ratio = pathLen / this.lastPathLen;
      for (var z = 0; z < this.letters.length; z++) {
        this.letters[z].u *= ratio;
      }
    }
    this.lastPathLen = pathLen;

    var count = this.letters.length;
    var spacing = pathLen / count;
    var kSpring = this.hovered && canHover ? 38 : 26;
    var noise = this.hovered && canHover ? 1.2 : 2.2;
    var normalMax = this.sw * 0.42;

    for (var i = 0; i < count; i++) {
      var L = this.letters[i];
      var prev = this.letters[(i - 1 + count) % count];
      var next = this.letters[(i + 1) % count];

      var nextU = next.u;
      if (i === count - 1) nextU += pathLen;
      var prevU = prev.u;
      if (i === 0) prevU -= pathLen;

      var stretchNext = nextU - L.u - spacing;
      var stretchPrev = L.u - prevU - spacing;
      var forceU = (stretchNext - stretchPrev) * kSpring;

      forceU += (Math.random() - 0.5) * noise;
      L.vU += forceU * dt;
      L.vU *= 0.86;
      L.u += L.vU * dt;

      while (L.u < 0) L.u += pathLen;
      while (L.u >= pathLen) L.u -= pathLen;

      var forceN = -L.n * (this.hovered && canHover ? 24 : 13);
      forceN += (Math.random() - 0.5) * noise * 0.55;
      L.vN += forceN * dt;
      L.vN *= 0.84;
      L.n += L.vN * dt;

      if (L.n > normalMax) {
        L.n = normalMax;
        L.vN *= -0.45;
      }
      if (L.n < -normalMax) {
        L.n = -normalMax;
        L.vN *= -0.45;
      }
    }

    for (var p = 0; p < count; p++) {
      var T = this.letters[p];
      var s = clamp(T.u, 0, pathLen);
      var pt = this.pathEl.getPointAtLength(s);
      var pt2 = this.pathEl.getPointAtLength(clamp(s + 1.5, 0, pathLen));
      var t = normalize(pt2.x - pt.x, pt2.y - pt.y);
      var n = { x: -t.y, y: t.x };

      T.tx = t.x;
      T.ty = t.y;
      T.nx = n.x;
      T.ny = n.y;
      T.x = pt.x + n.x * T.n;
      T.y = pt.y + n.y * T.n;
    }

    var minGap = canHover ? 14 : 12;
    for (var a = 0; a < count; a++) {
      for (var b = a + 1; b < count; b++) {
        var A = this.letters[a];
        var B = this.letters[b];
        var dx = B.x - A.x;
        var dy = B.y - A.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        if (dist >= minGap) continue;

        var nx = dx / dist;
        var ny = dy / dist;
        var impulse = (minGap - dist) * 0.16;

        var aLong = nx * A.tx + ny * A.ty;
        var aNorm = nx * A.nx + ny * A.ny;
        var bLong = nx * B.tx + ny * B.ty;
        var bNorm = nx * B.nx + ny * B.ny;

        A.vU -= aLong * impulse;
        A.vN -= aNorm * impulse;
        B.vU += bLong * impulse;
        B.vN += bNorm * impulse;
      }
    }

    for (var r = 0; r < count; r++) {
      var C = this.letters[r];
      C.n = clamp(C.n, -normalMax, normalMax);

      var len = clamp(C.u, 0, pathLen);
      var base = this.pathEl.getPointAtLength(len);
      var baseN = this.pathEl.getPointAtLength(clamp(len + 1.5, 0, pathLen));
      var dir = normalize(baseN.x - base.x, baseN.y - base.y);
      var normal = { x: -dir.y, y: dir.x };
      var x = base.x + normal.x * C.n;
      var y = base.y + normal.y * C.n;
      var ang = Math.atan2(dir.y, dir.x) * 180 / Math.PI;

      C.el.setAttribute('x', x);
      C.el.setAttribute('y', y);
      C.el.setAttribute('transform', 'rotate(' + ang + ',' + x + ',' + y + ')');
      C.el.style.opacity = this.hovered && canHover ? 1 : 0.9;
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
