/* ======================================================
   Studio OALUM – Yarn Menu
   Solid yarn strokes + ordered letters + collision bounce
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
        { word: 'About',      color: '#ffccc3', sw: 45, yOff: 0.2,  url: 'about.html' },
        { word: 'Archive',    color: '#eb4029', sw: 55, yOff: 0.45, url: 'archive.html' },
        { word: 'Shop',       color: '#ffeb53', sw: 35, yOff: 0.68, url: 'shop.html' },
        { word: 'Newsletter', color: '#cad5d8', sw: 42, yOff: 0.88, url: 'newsletter.html' }
    ];

    var yarns = [];
    var isPageOpen = false;

    function Yarn(cfg) {
        this.word = cfg.word.toUpperCase();
        this.color = cfg.color;
        this.sw = cfg.sw;
        this.baseY = H * cfg.yOff;
        this.url = cfg.url;

        this.points = [];
        for (var i = 0; i < 5; i++) {
            var t = i / 4;
            var edge = (i === 0 || i === 4);
            var jy = edge ? 0 : (Math.random() - 0.5) * 200;
            this.points.push({
                x: t * W,
                y: this.baseY + jy,
                currentX: t * W,
                currentY: this.baseY + jy,
                angle: Math.random() * 6.283,
                speed: (0.004 + Math.random() * 0.008) * 1.5,
                ampX: edge ? 2 : 8 + Math.random() * 15,
                ampY: edge ? 3 : 20 + Math.random() * 30
            });
        }

        this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathEl.setAttribute('class', 'yarn');
        this.pathEl.setAttribute('stroke', this.color);
        this.pathEl.setAttribute('stroke-width', this.sw);
        yarnGroup.appendChild(this.pathEl);

        this.hovered = false;
        this.transitioning = false;
        this.hoverRatio = 0.5;
        this.hoverAmt = 0;
        this.flow = Math.random();
        this.flowSpeed = 0.00038 + Math.random() * 0.00018;
        this.letters = [];

        this._mkLetters();
        this._bind();
    }

    Yarn.prototype._mkLetters = function () {
        var chars = this.word.split('');
        var rep = 15;
        for (var i = 0; i < chars.length * rep; i++) {
            var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = chars[i % chars.length];
            el.setAttribute('class', 'yarn-text');
            textGroup.appendChild(el);
            this.letters.push({ el: el, ratio: 0, x: 0, y: 0, vx: 0, vy: 0 });
        }
    };

    Yarn.prototype._bind = function () {
        var self = this;

        if (canHover) {
            this.pathEl.addEventListener('mouseenter', function (e) {
                if (isPageOpen) return;
                self.hovered = true;
                self.hoverRatio = e.clientX / W;
                yarnGroup.appendChild(self.pathEl);
            });

            this.pathEl.addEventListener('mouseleave', function () {
                self.hovered = false;
            });
        }

        this.pathEl.addEventListener('click', function () {
            if (isPageOpen) return;
            openPage(self);
        });
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
        this.points[4].currentX = W;

        var pts = this.points;
        var d = 'M ' + pts[0].currentX + ' ' + pts[0].currentY;
        for (var j = 0; j < pts.length - 1; j++) {
            var x1 = pts[j].currentX, y1 = pts[j].currentY;
            var x2 = pts[j + 1].currentX, y2 = pts[j + 1].currentY;
            var cpx = x1 + (x2 - x1) / 2;
            d += ' C ' + cpx + ' ' + y1 + ', ' + cpx + ' ' + y2 + ', ' + x2 + ' ' + y2;
        }
        this.pathEl.setAttribute('d', d);

        var goal = (this.hovered || this.transitioning) ? 1 : 0;
        this.hoverAmt += (goal - this.hoverAmt) * 0.08;
        this.pathEl.setAttribute('stroke-width', this.sw * (1 + this.hoverAmt * 0.15));

        if (!this.hovered && !this.transitioning) {
            this.flow += this.flowSpeed;
            if (this.flow > 1) this.flow -= 1;
        }
    };

    Yarn.prototype.updateLetters = function (timeSec) {
        var pathLen = this.pathEl.getTotalLength();
        if (!pathLen) return;

        var wl = this.word.length;
        var charSp = 12 / pathLen;
        var wordSp = 28 / pathLen;
        var grpLen = wl * charSp + wordSp;
        var nGroups = this.letters.length / wl;
        var half = nGroups / 2;
        var h = this.hoverAmt;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];
            var gi = Math.floor(i / wl);
            var ci = i % wl;
            var orderedRatio = (this.flow + gi * grpLen + ci * charSp) % 1;
            var targetRatio = orderedRatio;

            if (canHover && h > 0.05) {
                targetRatio = this.hoverRatio + (gi - half) * grpLen + ci * charSp;
            } else if (canHover) {
                targetRatio = orderedRatio + Math.sin(timeSec * 1.3 + i * 0.7) * 0.008;
            }

            while (targetRatio > 1) targetRatio -= 1;
            while (targetRatio < 0) targetRatio += 1;
            L.ratio = targetRatio;

            var len = L.ratio * pathLen;
            var pt = this.pathEl.getPointAtLength(len);
            var ptN = this.pathEl.getPointAtLength(Math.min(pathLen, len + 2));
            var ang = Math.atan2(ptN.y - pt.y, ptN.x - pt.x) * 180 / Math.PI;

            if (L.x === 0 && L.y === 0) {
                L.x = pt.x;
                L.y = pt.y;
            }

            var spring = (canHover && h > 0.05) ? 0.2 : 0.12;
            L.vx = (L.vx + (pt.x - L.x) * spring) * 0.75;
            L.vy = (L.vy + (pt.y - L.y) * spring) * 0.75;
            L.x += L.vx;
            L.y += L.vy;

            L.el._ang = ang;
        }

        var minDist = canHover ? 14 : 12;
        for (var a = 0; a < this.letters.length; a++) {
            for (var b = a + 1; b < this.letters.length; b++) {
                var A = this.letters[a];
                var B = this.letters[b];
                var dx = B.x - A.x;
                var dy = B.y - A.y;
                var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
                if (dist < minDist) {
                    var push = (minDist - dist) * 0.5;
                    var nx = dx / dist;
                    var ny = dy / dist;
                    A.x -= nx * push;
                    A.y -= ny * push;
                    B.x += nx * push;
                    B.y += ny * push;
                    A.vx -= nx * 0.08;
                    A.vy -= ny * 0.08;
                    B.vx += nx * 0.08;
                    B.vy += ny * 0.08;
                }
            }
        }

        for (var k = 0; k < this.letters.length; k++) {
            var T = this.letters[k];
            T.el.setAttribute('x', T.x);
            T.el.setAttribute('y', T.y);
            T.el.setAttribute('transform', 'rotate(' + T.el._ang + ',' + T.x + ',' + T.y + ')');
            T.el.style.opacity = 0.5 + h * 0.5;
        }
    };

    function openPage(yarn) {
        isPageOpen = true;
        yarn.transitioning = true;
        overlay.style.backgroundColor = yarn.color;

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
        DATA.forEach(function (cfg) { yarns.push(new Yarn(cfg)); });
    }

    function loop(t) {
        var timeSec = (t || 0) / 1000;
        for (var i = 0; i < yarns.length; i++) {
            yarns[i].updatePath();
            yarns[i].updateLetters(timeSec);
        }
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', build);
    build();
    loop();
})();
