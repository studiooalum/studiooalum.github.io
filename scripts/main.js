/* ======================================================
   Studio OALUM – Yarn Menu
   Pure SVG with feTurbulence filter (original design)
   Pull transition → separate HTML pages
====================================================== */
(function () {
    'use strict';

    var svg       = document.getElementById('svg-container');
    var yarnGroup = document.getElementById('yarn-group');
    var textGroup = document.getElementById('text-group');
    var overlay   = document.getElementById('page-overlay');

    var W = window.innerWidth;
    var H = window.innerHeight;

    var DATA = [
        { word: 'About',      color: '#ffb6c1', sw: 45, yOff: 0.2,  url: 'about.html' },
        { word: 'Archive',    color: '#ff1414',  sw: 55, yOff: 0.5,  url: 'archive.html' },
        { word: 'Shop',       color: '#ffd700',  sw: 35, yOff: 0.7,  url: 'shop.html' },
        { word: 'Newsletter', color: '#d1e0e3',  sw: 40, yOff: 0.9,  url: 'newsletter.html' }
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

        /* 5 control points with wobble */
        this.points = [
            { x: 0,        y: this.baseY, angle: Math.random() * 6.283, speed: 0.01  + Math.random() * 0.01 },
            { x: W * 0.25, y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * 6.283, speed: 0.005 + Math.random() * 0.01 },
            { x: W * 0.5,  y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * 6.283, speed: 0.008 + Math.random() * 0.01 },
            { x: W * 0.75, y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * 6.283, speed: 0.006 + Math.random() * 0.01 },
            { x: W,        y: this.baseY, angle: Math.random() * 6.283, speed: 0.01  + Math.random() * 0.01 }
        ];

        this.points.forEach(function (p) {
            p.currentX = p.x;
            p.currentY = p.y;
        });

        /* SVG path element */
        this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathEl.setAttribute('class', 'yarn');
        this.pathEl.setAttribute('stroke', this.color);
        this.pathEl.setAttribute('stroke-width', this.sw);
        yarnGroup.appendChild(this.pathEl);

        /* State */
        this.letters       = [];
        this.hovered       = false;
        this.transitioning = false;
        this.hoverRatio    = 0.5;

        this._mkLetters();
        this._bind();
    }

    /* ---- Letters (15 repeats = many groups) ---- */
    Yarn.prototype._mkLetters = function () {
        var chars = this.word.split('');
        var repeatCount = 15;

        for (var i = 0; i < chars.length * repeatCount; i++) {
            var ch = chars[i % chars.length];
            var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = ch;
            el.setAttribute('class', 'yarn-text');
            textGroup.appendChild(el);

            this.letters.push({
                el: el,
                idleRatio: Math.random(),
                ratio: Math.random()
            });
        }
    };

    /* ---- Events ---- */
    Yarn.prototype._bind = function () {
        var self = this;

        this.pathEl.addEventListener('mouseenter', function () {
            if (isPageOpen) return;
            self.hovered = true;
            yarnGroup.appendChild(self.pathEl);
        });

        this.pathEl.addEventListener('mousemove', function (e) {
            if (!self.hovered || isPageOpen) return;
            self.hoverRatio = e.clientX / W;
        });

        this.pathEl.addEventListener('mouseleave', function () {
            self.hovered = false;
            /* Assign new random idle positions on leave */
            self.letters.forEach(function (l) {
                l.idleRatio = Math.random();
            });
        });

        this.pathEl.addEventListener('click', function () {
            if (isPageOpen) return;
            openPage(self);
        });
    };

    /* ---- Update path (wobble + midpoint bezier) ---- */
    Yarn.prototype.updatePath = function () {
        /* Wobble inner points when not hovered/transitioning */
        if (!this.hovered && !this.transitioning) {
            for (var i = 1; i < this.points.length - 1; i++) {
                var p = this.points[i];
                p.angle += p.speed;
                p.currentY = p.y + Math.sin(p.angle) * 30;
                p.currentX = p.x + Math.cos(p.angle) * 15;
            }
        }

        var pts = this.points;
        var d = 'M ' + pts[0].x + ' ' + pts[0].currentY + ' ';

        for (var i = 0; i < pts.length - 1; i++) {
            var x1 = pts[i].currentX;
            var y1 = pts[i].currentY;
            var x2 = pts[i + 1].currentX;
            var y2 = pts[i + 1].currentY;
            var cpx = x1 + (x2 - x1) / 2;
            d += 'C ' + cpx + ' ' + y1 + ', ' + cpx + ' ' + y2 + ', ' + x2 + ' ' + y2 + ' ';
        }

        this.pathEl.setAttribute('d', d);
    };

    /* ---- Update letter positions ---- */
    Yarn.prototype.updateLetters = function () {
        var pathLen = this.pathEl.getTotalLength();
        if (pathLen === 0) return;

        var wl          = this.word.length;
        var charSpacing = 0.015;
        var wordSpacing = 0.04;
        var totalWordLen = wl * charSpacing + wordSpacing;
        var halfGroups   = this.letters.length / wl / 2;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];
            var target = L.idleRatio;

            if (this.hovered || this.transitioning) {
                var wgi = Math.floor(i / wl);
                var chi = i % wl;
                target = this.hoverRatio
                       + (wgi - halfGroups) * totalWordLen
                       + chi * charSpacing;
            }

            var spd = (this.hovered || this.transitioning) ? 0.08 : 0.01;
            L.ratio += (target - L.ratio) * spd;

            /* Wrap around */
            if (L.ratio > 1.1)  L.ratio -= 1.2;
            if (L.ratio < -0.1) L.ratio += 1.2;

            var pLen = Math.max(0, Math.min(1, L.ratio)) * pathLen;

            try {
                var pt  = this.pathEl.getPointAtLength(pLen);
                var ptA = this.pathEl.getPointAtLength(Math.min(pathLen, pLen + 2));
                var angle = Math.atan2(ptA.y - pt.y, ptA.x - pt.x) * 180 / Math.PI;

                L.el.setAttribute('x', pt.x);
                L.el.setAttribute('y', pt.y);
                L.el.setAttribute('transform', 'rotate(' + angle + ',' + pt.x + ',' + pt.y + ')');
                L.el.style.opacity = (this.hovered || this.transitioning) ? 1 : 0.6;
            } catch (e) {}
        }
    };

    /* ==================== Page transition ==================== */
    function openPage(yarn) {
        isPageOpen = true;
        activeYarn = yarn;
        yarn.transitioning = true;

        overlay.style.backgroundColor = yarn.color;

        var tl = gsap.timeline();

        /* Straighten yarn (pull effect) */
        tl.to(yarn.points, {
            currentY: yarn.baseY,
            currentX: function (i, target) { return target.x; },
            duration: 0.5,
            ease: 'back.out(1.5)'
        }, 0);

        /* Thin the yarn */
        tl.to(yarn.pathEl, {
            attr: { 'stroke-width': yarn.sw * 0.4 },
            duration: 0.5,
            ease: 'power2.out'
        }, 0);

        /* Slide overlay in from right */
        tl.to(overlay, {
            x: '0%',
            duration: 1.0,
            ease: 'power4.inOut'
        }, 0.2);

        /* Navigate to separate page after transition */
        tl.call(function () {
            window.location.href = yarn.url;
        }, null, 1.3);
    }

    /* ==================== Init / Loop ==================== */
    function build() {
        yarnGroup.innerHTML = '';
        textGroup.innerHTML = '';
        yarns = [];
        W = window.innerWidth;
        H = window.innerHeight;
        DATA.forEach(function (cfg) {
            yarns.push(new Yarn(cfg));
        });
    }

    function loop() {
        yarns.forEach(function (y) {
            y.updatePath();
            y.updateLetters();
        });
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', function () { build(); });
    build();
    loop();
})();
