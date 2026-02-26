/* ======================================================
   Studio OALUM – Yarn Menu
   Canvas (yarn textures) + SVG (hit-area + text)
   4 unique textures: crayon · paint · circles · brush
====================================================== */
(function () {
    'use strict';

    /* ---- DOM ---- */
    var canvas   = document.getElementById('yarn-canvas');
    var ctx      = canvas.getContext('2d');
    var svg      = document.getElementById('svg-container');
    var hitGroup = document.getElementById('hit-group');
    var txtGroup = document.getElementById('text-group');

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

    /* Deterministic noise 0-1 */
    function noise(s) {
        var x = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
    }

    /* ---- Config ---- */
    var DATA = [
        { word: 'About',      color: '#ffb6c1', sw: 58,  yOff: 0.18, texture: 'crayon',  url: 'about.html' },
        { word: 'Archive',    color: '#ff1414',  sw: 75,  yOff: 0.42, texture: 'paint',   url: 'archive.html' },
        { word: 'Shop',       color: '#ffd700',  sw: 50,  yOff: 0.68, texture: 'circles', url: 'shop.html' },
        { word: 'Newsletter', color: '#d1e0e3',  sw: 62,  yOff: 0.92, texture: 'brush',   url: 'newsletter.html' }
    ];

    var yarns = [];

    /* ====================================================== */
    /*  Yarn                                                   */
    /* ====================================================== */
    function Yarn(cfg) {
        this.word    = cfg.word.toUpperCase();
        this.color   = cfg.color;
        this.sw      = cfg.sw;
        this.baseY   = H * cfg.yOff;
        this.texture = cfg.texture;
        this.url     = cfg.url;

        /* Parse colour → RGB for rgba() */
        this.R = parseInt(cfg.color.slice(1, 3), 16);
        this.G = parseInt(cfg.color.slice(3, 5), 16);
        this.B = parseInt(cfg.color.slice(5, 7), 16);

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
        this.hovered  = false;
        this.hoverAmt = 0;

        /* Texture noise seed (stable per yarn) */
        this.nSeed = Math.floor(Math.random() * 100000);

        /* Letters */
        this.letters = [];
        this._mkLetters();
        this._bind();
    }

    /* ---- Letters (fixed count, even distribution = pattern) ---- */
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

            /* Even distribution along path */
            var ir = (i + 0.5) / total;
            /* Sinusoidal perpendicular offset → decorative pattern look */
            var ip = Math.sin(i * 1.4 + 0.7) * 0.4;

            this.letters.push({
                el: el,
                ci: i % wl,
                wi: Math.floor(i / wl),
                r: ir, p: ip, rot: 0,
                ir: ir, ip: ip,
                /* Subtle idle-drift oscillators */
                drp: Math.random() * 6.28, drs: 0.0004 + Math.random() * 0.001,
                dra: 0.004 + Math.random() * 0.008,
                dpp: Math.random() * 6.28, dps: 0.0005 + Math.random() * 0.001,
                dpa: 0.03 + Math.random() * 0.04
            });
        }
    };

    /* ---- Events (on hit-path only) ---- */
    Yarn.prototype._bind = function () {
        var self = this;
        this.hitEl.addEventListener('mouseenter', function () {
            self.hovered = true;
            hitGroup.appendChild(self.hitEl);   // bring to z-front
        });
        this.hitEl.addEventListener('mouseleave', function () {
            self.hovered = false;
        });
        this.hitEl.addEventListener('click', function () {
            window.location.href = self.url;
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

    /* ---- Trace bezier on Canvas (begins path, does NOT stroke) ---- */
    Yarn.prototype._trace = function (c) {
        var segs = this.segs;
        c.beginPath();
        c.moveTo(segs[0].sx, segs[0].sy);
        for (var i = 0; i < segs.length; i++) {
            var s = segs[i];
            c.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
        }
    };

    /* ======================== PER-FRAME UPDATE ======================== */

    Yarn.prototype.update = function () {
        /* Wobble anchors (only when not hovered) */
        if (!this.hovered) {
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
        var goal = this.hovered ? 1 : 0;
        this.hoverAmt += (goal - this.hoverAmt) * 0.08;

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

        /* Hover: narrower char-spacing, words at fixed positions */
        var csp = 0.018;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];

            /* Idle drift (very subtle) */
            L.drp += L.drs;
            L.dpp += L.dps;
            var iR = L.ir + Math.sin(L.drp) * L.dra;
            var iP = L.ip + Math.sin(L.dpp) * L.dpa * 0.25;

            /* Hover target → fixed word positions along thread */
            var wordCenter = (L.wi + 0.5) / rep;
            var charOff    = (L.ci - (wl - 1) / 2) * csp;
            var hR = wordCenter + charOff;
            var hP = 0;   // flush on thread when hovered

            /* Blend idle ↔ hover */
            var tR = iR * (1 - h) + hR * h;
            var tP = iP * (1 - h) + hP * h;

            var spd = h > 0.5 ? 0.12 : 0.04;
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

    /* ====================== TEXTURE DRAWING ====================== */

    /* ---- CRAYON (About, pink) ----
       Many fine parallel strokes with grainy gaps → coloured-pencil feel */
    Yarn.prototype._drawCrayon = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw = this.drawSW, sd = this.nSeed;
        var R = this.R, G = this.G, B = this.B;

        /* Sample points along curve */
        var N = 120, pts = [];
        for (var j = 0; j <= N; j++) pts.push(this.getAt(j / N));

        c.lineCap = 'round';

        var nLines = 22;
        for (var ln = 0; ln < nLines; ln++) {
            var offset   = ((ln / (nLines - 1)) - 0.5) * sw * 0.85;
            var lw       = 0.8 + noise(sd + ln * 31) * 2;
            var alpha    = 0.06 + noise(sd + ln * 17) * 0.18;
            var edgeDist = Math.abs(offset) / (sw * 0.42);

            c.beginPath();
            c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + alpha + ')';
            c.lineWidth   = lw;

            var started = false;
            for (var j = 0; j <= N; j++) {
                var p  = pts[j];
                var n1 = noise(sd + ln * 997 + j * 7);
                /* More gaps near edges — crayon doesn't cover evenly */
                if (n1 < 0.04 + edgeDist * 0.12) { started = false; continue; }

                var jitter = (noise(sd + ln * 503 + j * 13) - 0.5) * 2.5;
                var nx = -Math.sin(p.angle) * (offset + jitter);
                var ny =  Math.cos(p.angle) * (offset + jitter);

                if (!started) { c.moveTo(p.x + nx, p.y + ny); started = true; }
                else           { c.lineTo(p.x + nx, p.y + ny); }
            }
            c.stroke();
        }
    };

    /* ---- PAINT (Archive, red) ----
       Layered thick strokes (gradient/wet-edge) + splatter dots */
    Yarn.prototype._drawPaint = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw = this.drawSW, sd = this.nSeed;
        var R = this.R, G = this.G, B = this.B;

        c.lineCap  = 'round';
        c.lineJoin = 'round';

        /* Wet-edge outer glow */
        this._trace(c);
        c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.06)';
        c.lineWidth   = sw * 1.4;
        c.stroke();

        /* Wide semi-transparent body */
        this._trace(c);
        c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.25)';
        c.lineWidth   = sw * 1.05;
        c.stroke();

        /* Dense middle */
        this._trace(c);
        c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.5)';
        c.lineWidth   = sw * 0.7;
        c.stroke();

        /* Opaque saturated core */
        this._trace(c);
        c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.75)';
        c.lineWidth   = sw * 0.3;
        c.stroke();

        /* Paint splatters along edges */
        var N = 90;
        for (var i = 0; i < N; i++) {
            var p   = this.getAt(i / N);
            var n1  = noise(sd + i * 7  + 42);
            var n2  = noise(sd + i * 13 + 99);
            var n3  = noise(sd + i * 19 + 151);
            var off = (n1 - 0.5) * sw * 1.15;
            var nx  = -Math.sin(p.angle) * off;
            var ny  =  Math.cos(p.angle) * off;
            var rad = 1 + n2 * 4.5;
            var alp = 0.08 + n3 * 0.25;

            c.beginPath();
            c.arc(p.x + nx, p.y + ny, rad, 0, 6.283);
            c.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + alp + ')';
            c.fill();
        }
    };

    /* ---- CIRCLES (Shop, gold) ----
       Filled dots of varying sizes + outline rings + satellites */
    Yarn.prototype._drawCircles = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw = this.drawSW, sd = this.nSeed;
        var R = this.R, G = this.G, B = this.B;

        var N = 110;
        for (var i = 0; i < N; i++) {
            var ratio = (i + 0.5) / N;
            var p  = this.getAt(ratio);
            var n1 = noise(sd + i * 7);
            var n2 = noise(sd + i * 13);
            var n3 = noise(sd + i * 19);
            var n4 = noise(sd + i * 29);

            var off = (n1 - 0.5) * sw * 0.65;
            var nx  = -Math.sin(p.angle) * off;
            var ny  =  Math.cos(p.angle) * off;

            /* Main dot */
            var rad = sw * 0.06 + n2 * sw * 0.16;
            var alp = 0.25 + n3 * 0.55;
            c.beginPath();
            c.arc(p.x + nx, p.y + ny, rad, 0, 6.283);
            c.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + alp + ')';
            c.fill();

            /* Outline ring on some dots */
            if (n4 > 0.55) {
                c.beginPath();
                c.arc(p.x + nx, p.y + ny, rad * 1.4, 0, 6.283);
                c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (alp * 0.4) + ')';
                c.lineWidth = 1.2;
                c.stroke();
            }

            /* Satellite dots for depth */
            if (n4 > 0.45) {
                var so  = off + (n2 - 0.5) * sw * 0.45;
                var snx = -Math.sin(p.angle) * so;
                var sny =  Math.cos(p.angle) * so;
                c.beginPath();
                c.arc(p.x + snx, p.y + sny, 1 + n3 * 2.5, 0, 6.283);
                c.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (alp * 0.5) + ')';
                c.fill();
            }
        }
    };

    /* ---- BRUSH (Newsletter, gray-blue) ----
       Parallel bristle strokes with per-point wobble → dry-brush feel */
    Yarn.prototype._drawBrush = function (c) {
        var segs = this.segs;
        if (!segs.length) return;
        var sw = this.drawSW, sd = this.nSeed;
        var R = this.R, G = this.G, B = this.B;

        c.lineCap = 'round';

        var N = 90;            // sample points per bristle
        var nBristles = 14;

        for (var b = 0; b < nBristles; b++) {
            var bN2 = noise(sd + b * 13);
            var bN3 = noise(sd + b * 19);
            var lw  = 1.2 + bN3 * 3.5;
            var alp = 0.07 + bN2 * 0.2;
            var baseOff = ((b / (nBristles - 1)) - 0.5) * sw * 0.88;

            c.beginPath();
            c.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + alp + ')';
            c.lineWidth   = lw;

            for (var j = 0; j <= N; j++) {
                var p = this.getAt(j / N);
                /* Bristle wobble: sine + per-point noise */
                var wobble = Math.sin(j * 0.25 + b * 2.3) * sw * 0.06;
                var nJ = noise(sd + b * 701 + j * 11);
                wobble += (nJ - 0.5) * sw * 0.08;

                var off = baseOff + wobble;
                var nx  = -Math.sin(p.angle) * off;
                var ny  =  Math.cos(p.angle) * off;

                if (j === 0) c.moveTo(p.x + nx, p.y + ny);
                else         c.lineTo(p.x + nx, p.y + ny);
            }
            c.stroke();
        }
    };

    /* ---- Draw dispatcher ---- */
    Yarn.prototype.draw = function (c) {
        if (!this.segs.length) return;
        switch (this.texture) {
            case 'crayon':  this._drawCrayon(c);  break;
            case 'paint':   this._drawPaint(c);   break;
            case 'circles': this._drawCircles(c); break;
            case 'brush':   this._drawBrush(c);   break;
        }
    };

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
