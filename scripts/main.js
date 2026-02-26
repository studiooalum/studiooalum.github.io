/* ======================================================
   Studio OALUM - Yarn Menu
   Canvas (yarn visuals) + SVG (hit-area + text letters)
   Catmull-Rom curves, pure-JS point evaluation
====================================================== */
(function () {
    'use strict';

    /* ---- DOM ---- */
    const canvas   = document.getElementById('yarn-canvas');
    const ctx      = canvas.getContext('2d');
    const svg      = document.getElementById('svg-container');
    const hitGroup = document.getElementById('hit-group');
    const txtGroup = document.getElementById('text-group');
    const overlay  = document.getElementById('page-overlay');
    const oTitle   = document.getElementById('page-title');
    const oBtn     = document.getElementById('close-btn');
    const oContent = document.querySelectorAll('.overlay-content');

    let W, H, DPR;

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

    /* ---- Cubic Bezier math ---- */
    function bezPt(a, b, c, d, t) {
        var m = 1 - t, m2 = m * m, t2 = t * t;
        return {
            x: m2*m*a.x + 3*m2*t*b.x + 3*m*t2*c.x + t2*t*d.x,
            y: m2*m*a.y + 3*m2*t*b.y + 3*m*t2*c.y + t2*t*d.y
        };
    }
    function bezTan(a, b, c, d, t) {
        var m = 1 - t;
        return {
            x: 3*m*m*(b.x-a.x) + 6*m*t*(c.x-b.x) + 3*t*t*(d.x-c.x),
            y: 3*m*m*(b.y-a.y) + 6*m*t*(c.y-b.y) + 3*t*t*(d.y-c.y)
        };
    }

    /* ---- Yarn config ---- */
    var DATA = [
        { word: 'About',      color: '#ffb6c1', sw: 50,  yOff: 0.18 },
        { word: 'Archive',    color: '#ff1414',  sw: 60,  yOff: 0.42 },
        { word: 'Shop',       color: '#ffd700',  sw: 42,  yOff: 0.68 },
        { word: 'Newsletter', color: '#d1e0e3',  sw: 48,  yOff: 0.92 }
    ];

    var yarns = [];
    var isPageOpen = false;
    var activeYarn = null;

    /* ====================================================== */
    /*  Yarn class                                            */
    /* ====================================================== */
    function Yarn(cfg) {
        this.word  = cfg.word.toUpperCase();
        this.color = cfg.color;
        this.sw    = cfg.sw;
        this.baseY = H * cfg.yOff;

        /* --- anchors (Catmull-Rom control points) --- */
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
        this.segs = [];           // Catmull-Rom bezier segments
        this.drawSW = this.sw;    // rendered stroke width

        /* --- invisible SVG hit path --- */
        this.hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.hitEl.setAttribute('fill', 'none');
        this.hitEl.setAttribute('stroke', 'rgba(0,0,0,0)');
        this.hitEl.setAttribute('stroke-width', this.sw + 50);
        this.hitEl.style.cursor = 'pointer';
        this.hitEl.style.pointerEvents = 'stroke';
        hitGroup.appendChild(this.hitEl);

        /* --- state --- */
        this.hovered      = false;
        this.transitioning = false;
        this.hoverX       = 0.5;
        this.hoverAmt     = 0;   // 0=idle  1=gathered

        /* --- letters --- */
        this.letters = [];
        this._mkLetters();
        this._bind();
    }

    /* ---- letters (fixed count, never added/removed) ---- */
    Yarn.prototype._mkLetters = function () {
        var chars = this.word.split('');
        var wl    = chars.length;
        var rep   = Math.ceil(28 / wl);   // ~28 total letters per yarn
        var total = wl * rep;

        for (var i = 0; i < total; i++) {
            var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = chars[i % wl];
            el.setAttribute('class', 'yarn-text');
            txtGroup.appendChild(el);

            var ir = Math.random();
            var ip = (Math.random() - 0.5) * 0.7;
            this.letters.push({
                el: el,
                ci: i % wl,
                wi: Math.floor(i / wl),
                r: ir, p: ip, rot: 0,
                ir: ir, ip: ip,
                drp: Math.random()*6.28, drs: 0.0006+Math.random()*0.0018, dra: 0.006+Math.random()*0.012,
                dpp: Math.random()*6.28, dps: 0.0008+Math.random()*0.002,  dpa: 0.04+Math.random()*0.08
            });
        }
    };

    /* ---- events (only on hit path) ---- */
    Yarn.prototype._bind = function () {
        var self = this;
        this.hitEl.addEventListener('mouseenter', function () {
            if (isPageOpen) return;
            self.hovered = true;
            hitGroup.appendChild(self.hitEl);   // z-front
        });
        this.hitEl.addEventListener('mousemove', function (e) {
            if (!self.hovered || isPageOpen) return;
            self.hoverX = e.clientX / W;
        });
        this.hitEl.addEventListener('mouseleave', function () {
            self.hovered = false;
        });
        this.hitEl.addEventListener('click', function () {
            if (isPageOpen) return;
            openPage(self);
        });
    };

    /* ---- compute Catmull-Rom -> Bezier segments ---- */
    Yarn.prototype._buildSegs = function () {
        var a = this.anchors, n = a.length;
        this.segs = [];
        for (var i = 0; i < n - 1; i++) {
            var p0 = a[Math.max(0, i-1)];
            var p1 = a[i];
            var p2 = a[i+1];
            var p3 = a[Math.min(n-1, i+2)];
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

    /* ---- evaluate point & tangent at ratio 0-1 ---- */
    Yarn.prototype.getAt = function (ratio) {
        var segs = this.segs, n = segs.length;
        if (n === 0) return { x: 0, y: 0, angle: 0 };
        var raw = ratio * n;
        var idx = Math.max(0, Math.min(n - 1, Math.floor(raw)));
        var lt  = Math.max(0, Math.min(1, raw - idx));
        var s   = segs[idx];
        var P0  = { x: s.sx,  y: s.sy };
        var P1  = { x: s.c1x, y: s.c1y };
        var P2  = { x: s.c2x, y: s.c2y };
        var P3  = { x: s.ex,  y: s.ey };
        var pt  = bezPt(P0, P1, P2, P3, lt);
        var tn  = bezTan(P0, P1, P2, P3, lt);
        return { x: pt.x, y: pt.y, angle: Math.atan2(tn.y, tn.x) };
    };

    /* ---- SVG path d-string from segments ---- */
    Yarn.prototype._pathD = function () {
        if (!this.segs.length) return '';
        var d = 'M ' + this.segs[0].sx + ' ' + this.segs[0].sy;
        for (var i = 0; i < this.segs.length; i++) {
            var s = this.segs[i];
            d += ' C ' + s.c1x + ' ' + s.c1y + ',' + s.c2x + ' ' + s.c2y + ',' + s.ex + ' ' + s.ey;
        }
        return d;
    };

    /* ============================ per-frame ============================ */

    Yarn.prototype.update = function () {
        /* 1. wobble anchors (skip when hovered or transitioning) */
        if (!this.hovered && !this.transitioning) {
            for (var i = 0; i < this.anchors.length; i++) {
                var a = this.anchors[i];
                a.px += a.sx;
                a.py += a.sy;
                a.x = a.bx + Math.cos(a.px) * a.ax;
                a.y = a.by + Math.sin(a.py) * a.ay;
            }
        }

        /* 2. recompute curve */
        this._buildSegs();

        /* 3. update invisible SVG hit-path */
        this.hitEl.setAttribute('d', this._pathD());

        /* 4. hover blend */
        var goal = (this.hovered || this.transitioning) ? 1 : 0;
        this.hoverAmt += (goal - this.hoverAmt) * 0.09;

        /* 5. stroke width animation */
        var tSW = this.sw * (1 + this.hoverAmt * 0.12);
        this.drawSW += (tSW - this.drawSW) * 0.1;

        /* 6. letters */
        this._updateLetters();
    };

    Yarn.prototype._updateLetters = function () {
        var wl  = this.word.length;
        var rep = this.letters.length / wl;
        var csp = 0.020;
        var wgp = 0.04;
        var ww  = wl * csp + wgp;
        var h   = this.hoverAmt;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];

            /* idle drift */
            L.drp += L.drs;
            L.dpp += L.dps;
            var iR = L.ir + Math.sin(L.drp) * L.dra;
            var iP = L.ip + Math.sin(L.dpp) * L.dpa * 0.3;

            /* hover target */
            var center = rep / 2;
            var hR = this.hoverX + (L.wi - center) * ww + L.ci * csp;
            var hP = 0;

            /* blend */
            var tR = iR * (1 - h) + hR * h;
            var tP = iP * (1 - h) + hP * h;

            var spd = h > 0.5 ? 0.14 : 0.05;
            L.r += (tR - L.r) * spd;
            L.p += (tP - L.p) * spd;

            /* render position */
            var cr = Math.max(0, Math.min(1, L.r));
            var info = this.getAt(cr);
            var px = -Math.sin(info.angle) * L.p * this.sw * 0.5;
            var py =  Math.cos(info.angle) * L.p * this.sw * 0.5;
            var fx = info.x + px;
            var fy = info.y + py;
            var rd = info.angle * 180 / Math.PI;

            /* smooth rotation */
            var dRot = rd - L.rot;
            if (dRot >  180) dRot -= 360;
            if (dRot < -180) dRot += 360;
            L.rot += dRot * 0.12;

            L.el.setAttribute('x', fx);
            L.el.setAttribute('y', fy);
            L.el.setAttribute('transform', 'rotate(' + L.rot + ',' + fx + ',' + fy + ')');
            L.el.style.opacity = (0.5 + h * 0.5);
            L.el.style.display = (L.r >= -0.02 && L.r <= 1.02) ? '' : 'none';
        }
    };

    /* ---- draw yarn on Canvas ---- */
    Yarn.prototype.draw = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw  = this.drawSW;
        var col = this.color;

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
            c.strokeStyle  = col;
            c.lineWidth    = sw * l.m;
            c.globalAlpha  = l.a;
            c.stroke();
        }
        c.globalAlpha = 1;
    };

    /* ==================== init / loop ==================== */
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

    /* ==================== page transition (GSAP) ==================== */
    function openPage(yarn) {
        isPageOpen = true;
        activeYarn = yarn;
        yarn.transitioning = true;

        oTitle.textContent = yarn.word;
        overlay.style.backgroundColor = yarn.color;

        var dark = (yarn.color === '#ff1414');
        overlay.style.color        = dark ? '#fff' : '#000';
        oBtn.style.backgroundColor = dark ? '#fff' : '#000';
        oBtn.style.color           = dark ? '#000' : '#fff';

        /* reset overlay content for clean animation */
        gsap.set(oContent, { y: 30, opacity: 0 });
        gsap.set(overlay, { x: '100%' });

        var tl = gsap.timeline();

        /* straighten yarn */
        tl.to(yarn.anchors, {
            y: yarn.baseY,
            x: function (i, target) { return target.bx; },
            duration: 0.5,
            ease: 'back.out(1.5)'
        }, 0);

        /* thin yarn */
        tl.to(yarn, {
            drawSW: yarn.sw * 0.25,
            duration: 0.5,
            ease: 'power2.out'
        }, 0);

        /* slide overlay in */
        tl.to(overlay, {
            x: '0%',
            duration: 1.2,
            ease: 'power4.inOut'
        }, 0.2);

        /* content reveal */
        tl.to(oContent, {
            y: 0, opacity: 1,
            duration: 0.8, stagger: 0.1,
            ease: 'power3.out'
        }, 0.8);
    }

    function closePage() {
        if (!isPageOpen) return;
        var yarn = activeYarn;

        var tl = gsap.timeline({
            onComplete: function () {
                isPageOpen = false;
                activeYarn = null;
                if (!yarn) return;

                /* return anchors to their base (with jitter) smoothly */
                gsap.to(yarn.anchors, {
                    y: function (i, target) { return target.by; },
                    x: function (i, target) { return target.bx; },
                    duration: 0.6,
                    ease: 'power2.out',
                    onComplete: function () {
                        yarn.transitioning = false;
                        yarn.hovered = false;
                    }
                });
                gsap.to(yarn, { drawSW: yarn.sw, duration: 0.5 });
            }
        });

        tl.to(oContent, {
            y: -30, opacity: 0,
            duration: 0.4, ease: 'power2.in'
        }, 0);

        tl.to(overlay, {
            x: '100%',
            duration: 1, ease: 'power4.inOut'
        }, 0.2);
    }

    /* expose closePage globally */
    window.closePage = closePage;
    oBtn.addEventListener('click', closePage);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePage();
    });
    window.addEventListener('resize', function () { build(); });

    /* start */
    build();
    loop();
})();
