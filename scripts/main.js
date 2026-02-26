/* ======================================================
   Studio OALUM – Yarn Menu
   Canvas (vivid layered lines) + SVG (hit-area + text)
   Pull transition → separate HTML pages
====================================================== */
(function () {
    'use strict';

    /* ---- DOM ---- */
    var canvas   = document.getElementById('yarn-canvas');
    var ctx      = canvas.getContext('2d');
    var svg      = document.getElementById('svg-container');
    var hitGroup = document.getElementById('hit-group');
    var txtGroup = document.getElementById('text-group');
    var overlay  = document.getElementById('page-overlay');

    var W, H, DPR;

    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = W * DPR;
        canvas.height = H * DPR;
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }

    /* ---- Math helpers ---- */
    function bezPt(a, b, c, d, t) {
        var m = 1 - t, m2 = m * m, t2 = t * t;
        return {
            x: m2 * m * a.x + 3 * m2 * t * b.x + 3 * m * t2 * c.x + t2 * t * d.x,
            y: m2 * m * a.y + 3 * m2 * t * b.y + 3 * m * t2 * c.y + t2 * t * d.y
        };
    }
    function bezTan(a, b, c, d, t) {
        var m = 1 - t;
        return {
            x: 3 * m * m * (b.x - a.x) + 6 * m * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
            y: 3 * m * m * (b.y - a.y) + 6 * m * t * (c.y - b.y) + 3 * t * t * (d.y - c.y)
        };
    }

    /* ---- Config ---- */
    var DATA = [
        { word: 'About',      color: '#ffb6c1', sw: 30,  yOff: 0.18, url: 'about.html' },
        { word: 'Archive',    color: '#ff1414',  sw: 55,  yOff: 0.42, url: 'archive.html' },
        { word: 'Shop',       color: '#ffd700',  sw: 20,  yOff: 0.68, url: 'shop.html' },
        { word: 'Newsletter', color: '#d1e0e3',  sw: 42,  yOff: 0.92, url: 'newsletter.html' }
    ];

    var yarns = [];
    var isPageOpen = false;
    var activeYarn = null;

    /* ====================================================== */
    /*  Yarn                                                   */
    /* ====================================================== */
    function Yarn(cfg) {
        this.word  = cfg.word.toUpperCase();
        this.color = cfg.color;
        this.sw    = cfg.sw;
        this.baseY = H * cfg.yOff;
        this.url   = cfg.url;

        /* Anchors (7 Catmull-Rom control points) */
        var N = 7;
        this.anchors = [];
        for (var i = 0; i < N; i++) {
            var t = i / (N - 1);
            var edge = (i === 0 || i === N - 1);
            var jY = edge ? 0 : (Math.random() - 0.5) * 220;
            this.anchors.push({
                bx: t * W, by: this.baseY + jY,
                x:  t * W, y:  this.baseY + jY,
                px: Math.random() * 6.283, py: Math.random() * 6.283,
                sx: 0.002 + Math.random() * 0.004,
                sy: 0.003 + Math.random() * 0.005,
                ax: edge ? 2 : 8 + Math.random() * 10,
                ay: edge ? 4 : 15 + Math.random() * 22
            });
        }
        this.segs   = [];
        this.drawSW = this.sw;

        /* Invisible SVG hit path */
        this.hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.hitEl.setAttribute('fill', 'none');
        this.hitEl.setAttribute('stroke', 'rgba(0,0,0,0)');
        this.hitEl.setAttribute('stroke-width', this.sw + 50);
        this.hitEl.style.cursor = 'pointer';
        this.hitEl.style.pointerEvents = 'stroke';
        hitGroup.appendChild(this.hitEl);

        /* State */
        this.hovered       = false;
        this.transitioning = false;
        this.hoverAmt      = 0;

        /* Letters */
        this.letters = [];
        this._mkLetters();
        this._bind();
    }

    /* ---- Letters (random default positions) ---- */
    Yarn.prototype._mkLetters = function () {
        var chars = this.word.split('');
        var wl    = chars.length;
        var rep   = Math.ceil(28 / wl);
        var total = wl * rep;

        for (var i = 0; i < total; i++) {
            var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = chars[i % wl];
            el.setAttribute('class', 'yarn-text');
            txtGroup.appendChild(el);

            /* Random position along path + random perpendicular offset */
            var ir = Math.random();
            var ip = (Math.random() - 0.5) * 0.7;

            this.letters.push({
                el: el,
                ci: i % wl,
                wi: Math.floor(i / wl),
                r: ir, p: ip, rot: 0,
                ir: ir, ip: ip,
                /* Idle drift oscillators */
                drp: Math.random() * 6.28, drs: 0.0006 + Math.random() * 0.0018,
                dra: 0.006 + Math.random() * 0.012,
                dpp: Math.random() * 6.28, dps: 0.0008 + Math.random() * 0.002,
                dpa: 0.04 + Math.random() * 0.08
            });
        }
    };

    /* ---- Events (on hit-path only) ---- */
    Yarn.prototype._bind = function () {
        var self = this;
        this.hitEl.addEventListener('mouseenter', function () {
            if (isPageOpen) return;
            self.hovered = true;
            hitGroup.appendChild(self.hitEl);
        });
        this.hitEl.addEventListener('mouseleave', function () {
            self.hovered = false;
        });
        this.hitEl.addEventListener('click', function () {
            if (isPageOpen) return;
            openPage(self);
        });
    };

    /* ---- Catmull-Rom → Bezier segments ---- */
    Yarn.prototype._buildSegs = function () {
        var a = this.anchors, n = a.length;
        this.segs = [];
        for (var i = 0; i < n - 1; i++) {
            var p0 = a[Math.max(0, i - 1)];
            var p1 = a[i];
            var p2 = a[i + 1];
            var p3 = a[Math.min(n - 1, i + 2)];
            this.segs.push({
                sx: p1.x, sy: p1.y,
                c1x: p1.x + (p2.x - p0.x) / 6,
                c1y: p1.y + (p2.y - p0.y) / 6,
                c2x: p2.x - (p3.x - p1.x) / 6,
                c2y: p2.y - (p3.y - p1.y) / 6,
                ex: p2.x, ey: p2.y
            });
        }
    };

    /* ---- Evaluate point + tangent at ratio 0-1 ---- */
    Yarn.prototype.getAt = function (ratio) {
        var segs = this.segs, n = segs.length;
        if (n === 0) return { x: 0, y: 0, angle: 0 };
        var raw = ratio * n;
        var idx = Math.max(0, Math.min(n - 1, Math.floor(raw)));
        var lt  = Math.max(0, Math.min(1, raw - idx));
        var s   = segs[idx];
        var P0 = { x: s.sx,  y: s.sy  };
        var P1 = { x: s.c1x, y: s.c1y };
        var P2 = { x: s.c2x, y: s.c2y };
        var P3 = { x: s.ex,  y: s.ey  };
        var pt = bezPt(P0, P1, P2, P3, lt);
        var tn = bezTan(P0, P1, P2, P3, lt);
        return { x: pt.x, y: pt.y, angle: Math.atan2(tn.y, tn.x) };
    };

    /* ---- SVG path d-string ---- */
    Yarn.prototype._pathD = function () {
        if (!this.segs.length) return '';
        var d = 'M ' + this.segs[0].sx + ' ' + this.segs[0].sy;
        for (var i = 0; i < this.segs.length; i++) {
            var s = this.segs[i];
            d += ' C ' + s.c1x + ' ' + s.c1y + ',' + s.c2x + ' ' + s.c2y + ',' + s.ex + ' ' + s.ey;
        }
        return d;
    };

    /* ======================== PER-FRAME UPDATE ======================== */

    Yarn.prototype.update = function () {
        /* Wobble anchors (skip during hover or transition) */
        if (!this.hovered && !this.transitioning) {
            for (var i = 0; i < this.anchors.length; i++) {
                var a = this.anchors[i];
                a.px += a.sx;
                a.py += a.sy;
                a.x = a.bx + Math.cos(a.px) * a.ax;
                a.y = a.by + Math.sin(a.py) * a.ay;
            }
        }

        this._buildSegs();
        this.hitEl.setAttribute('d', this._pathD());

        /* Hover blend (0 → 1 smooth) */
        var goal = (this.hovered || this.transitioning) ? 1 : 0;
        this.hoverAmt += (goal - this.hoverAmt) * 0.09;

        /* Stroke width slight swell on hover */
        var tSW = this.sw * (1 + this.hoverAmt * 0.12);
        this.drawSW += (tSW - this.drawSW) * 0.1;

        this._updateLetters();
    };

    /* ---- Update letter positions ---- */
    Yarn.prototype._updateLetters = function () {
        var wl  = this.word.length;
        var rep = this.letters.length / wl;
        var h   = this.hoverAmt;

        /* Tight char spacing when grouped as word */
        var csp = 0.012;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];

            /* Idle drift */
            L.drp += L.drs;
            L.dpp += L.dps;
            var iR = L.ir + Math.sin(L.drp) * L.dra;
            var iP = L.ip + Math.sin(L.dpp) * L.dpa * 0.3;

            /* Hover target → fixed word positions along thread, tight spacing */
            var wordCenter = (L.wi + 0.5) / rep;
            var charOff    = (L.ci - (wl - 1) / 2) * csp;
            var hR = wordCenter + charOff;
            var hP = 0;

            /* Blend idle ↔ hover */
            var tR = iR * (1 - h) + hR * h;
            var tP = iP * (1 - h) + hP * h;

            var spd = h > 0.5 ? 0.14 : 0.05;
            L.r += (tR - L.r) * spd;
            L.p += (tP - L.p) * spd;

            /* Render position on path */
            var cr   = Math.max(0, Math.min(1, L.r));
            var info = this.getAt(cr);
            var px   = -Math.sin(info.angle) * L.p * this.sw * 0.5;
            var py   =  Math.cos(info.angle) * L.p * this.sw * 0.5;
            var fx   = info.x + px;
            var fy   = info.y + py;
            var rd   = info.angle * 180 / Math.PI;

            /* Smooth rotation */
            var dRot = rd - L.rot;
            if (dRot >  180) dRot -= 360;
            if (dRot < -180) dRot += 360;
            L.rot += dRot * 0.12;

            L.el.setAttribute('x', fx);
            L.el.setAttribute('y', fy);
            L.el.setAttribute('transform', 'rotate(' + L.rot + ',' + fx + ',' + fy + ')');
            L.el.style.opacity = 0.5 + h * 0.5;
            L.el.style.display = (L.r >= -0.02 && L.r <= 1.02) ? '' : 'none';
        }
    };

    /* ====================== VIVID LAYERED LINES ====================== */

    Yarn.prototype.draw = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw  = this.drawSW;
        var col = this.color;

        /* 5 concentric layers: wide+faint → narrow+opaque */
        var layers = [
            { m: 1.35, a: 0.08 },
            { m: 1.15, a: 0.18 },
            { m: 0.95, a: 0.38 },
            { m: 0.7,  a: 0.65 },
            { m: 0.4,  a: 1.0 }
        ];

        c.lineCap  = 'round';
        c.lineJoin = 'round';

        for (var li = 0; li < layers.length; li++) {
            var l = layers[li];
            c.beginPath();
            c.moveTo(segs[0].sx, segs[0].sy);
            for (var si = 0; si < segs.length; si++) {
                var s = segs[si];
                c.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
            }
            c.strokeStyle = col;
            c.lineWidth   = sw * l.m;
            c.globalAlpha = l.a;
            c.stroke();
        }
        c.globalAlpha = 1;
    };

    /* ======================== PAGE TRANSITION ======================== */

    function openPage(yarn) {
        isPageOpen = true;
        activeYarn = yarn;
        yarn.transitioning = true;

        /* Set overlay colour to match yarn */
        overlay.style.backgroundColor = yarn.color;

        var tl = gsap.timeline();

        /* Straighten yarn (pull effect) */
        tl.to(yarn.anchors, {
            y: yarn.baseY,
            x: function (i, target) { return target.bx; },
            duration: 0.5,
            ease: 'back.out(1.5)'
        }, 0);

        /* Thin the yarn */
        tl.to(yarn, {
            drawSW: yarn.sw * 0.25,
            duration: 0.5,
            ease: 'power2.out'
        }, 0);

        /* Slide overlay in from right */
        tl.to(overlay, {
            x: '0%',
            duration: 1.0,
            ease: 'power4.inOut'
        }, 0.2);

        /* Navigate to separate page after transition completes */
        tl.call(function () {
            window.location.href = yarn.url;
        }, null, 1.3);
    }

    /* ======================== INIT / LOOP ======================== */

    function build() {
        hitGroup.innerHTML = '';
        txtGroup.innerHTML = '';
        yarns = [];
        resize();
        for (var i = 0; i < DATA.length; i++) {
            yarns.push(new Yarn(DATA[i]));
        }
    }

    function loop() {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < yarns.length; i++) {
            yarns[i].update();
            yarns[i].draw(ctx);
        }
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', function () { build(); });
    build();
    loop();
})();
