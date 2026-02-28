/* ======================================================
   Studio OALUM – Yarn Menu
   SVG stroke + Canvas-generated PNG textures (no filters)
   Pull transition → separate HTML pages
====================================================== */
(function () {
    'use strict';

    /* ---- DOM ---- */
    var svg       = document.getElementById('svg-container');
    var defs      = svg.querySelector('defs');
    var yarnGroup = document.getElementById('yarn-group');
    var textGroup = document.getElementById('text-group');
    var overlay   = document.getElementById('page-overlay');

    var W = window.innerWidth;
    var H = window.innerHeight;

    /* ---- Thread data ---- */
    var DATA = [
        { word: 'About',      color: '#ffccc3', sw: 45, yOff: 0.2,  url: 'about.html',      tex: 'brush'   },
        { word: 'Archive',    color: '#eb4029',  sw: 55, yOff: 0.45, url: 'archive.html',    tex: 'paint'   },
        { word: 'Shop',       color: '#ffeb53',  sw: 35, yOff: 0.68, url: 'shop.html',       tex: 'circles' },
        { word: 'Newsletter', color: '#cad5d8',  sw: 42, yOff: 0.88, url: 'newsletter.html', tex: 'pencil'  }
    ];

    var yarns = [];
    var isPageOpen = false;

    /* ============================================================ */
    /*  Procedural PNG Texture Generation                           */
    /*  Canvas → dataURL → SVG <pattern> (runs once at build)       */
    /* ============================================================ */
    var SZ = 256;                        // tile size

    function rgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }
    function cl(v) { return Math.max(0, Math.min(255, Math.round(v))); }

    /* 1) Brush strokes — dry-brush fibre feel */
    function texBrush(color) {
        var c = document.createElement('canvas'); c.width = c.height = SZ;
        var x = c.getContext('2d'), o = rgb(color);
        x.fillStyle = color; x.fillRect(0, 0, SZ, SZ);

        x.lineCap = 'round';
        for (var i = 0; i < 140; i++) {
            var sx = Math.random() * SZ, sy = Math.random() * SZ;
            var len = 6 + Math.random() * 35;
            var ang = (Math.random() - 0.5) * 0.5;          // mostly horizontal
            var lw = 0.8 + Math.random() * 3.5;
            var dr = cl(o.r + (Math.random() - 0.5) * 70);
            var dg = cl(o.g + (Math.random() - 0.5) * 70);
            var db = cl(o.b + (Math.random() - 0.5) * 70);
            x.strokeStyle = 'rgba(' + dr + ',' + dg + ',' + db + ',' + (0.12 + Math.random() * 0.35) + ')';
            x.lineWidth = lw;
            x.beginPath(); x.moveTo(sx, sy);
            x.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
            x.stroke();
        }
        return c.toDataURL();
    }

    /* 2) Wet paint — thick blobs + drips */
    function texPaint(color) {
        var c = document.createElement('canvas'); c.width = c.height = SZ;
        var x = c.getContext('2d'), o = rgb(color);
        x.fillStyle = color; x.fillRect(0, 0, SZ, SZ);

        for (var i = 0; i < 70; i++) {
            var cx = Math.random() * SZ, cy = Math.random() * SZ;
            var r = 4 + Math.random() * 28;
            var dr = cl(o.r + (Math.random() - 0.5) * 90);
            var dg = cl(o.g + (Math.random() - 0.5) * 90);
            var db = cl(o.b + (Math.random() - 0.5) * 90);
            x.fillStyle = 'rgba(' + dr + ',' + dg + ',' + db + ',' + (0.08 + Math.random() * 0.45) + ')';
            x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill();
        }
        x.lineCap = 'round';
        for (var i = 0; i < 18; i++) {
            var sx = Math.random() * SZ, sy = Math.random() * SZ;
            var lw = 2 + Math.random() * 7, len = 12 + Math.random() * 45;
            x.strokeStyle = 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + (0.15 + Math.random() * 0.3) + ')';
            x.lineWidth = lw;
            x.beginPath(); x.moveTo(sx, sy);
            x.lineTo(sx + (Math.random() - 0.5) * 10, sy + len);
            x.stroke();
        }
        return c.toDataURL();
    }

    /* 3) Overlapping circles — playful cloud feel */
    function texCircles(color) {
        var c = document.createElement('canvas'); c.width = c.height = SZ;
        var x = c.getContext('2d'), o = rgb(color);
        x.fillStyle = color; x.fillRect(0, 0, SZ, SZ);

        for (var i = 0; i < 180; i++) {
            var cx = Math.random() * SZ, cy = Math.random() * SZ;
            var r = 2 + Math.random() * 20;
            var dr = cl(o.r + (Math.random() - 0.5) * 55);
            var dg = cl(o.g + (Math.random() - 0.5) * 55);
            var db = cl(o.b + (Math.random() - 0.5) * 55);
            x.fillStyle = 'rgba(' + dr + ',' + dg + ',' + db + ',' + (0.04 + Math.random() * 0.18) + ')';
            x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill();
        }
        return c.toDataURL();
    }

    /* 4) Pencil grain — fine hatching + noise */
    function texPencil(color) {
        var c = document.createElement('canvas'); c.width = c.height = SZ;
        var x = c.getContext('2d'), o = rgb(color);
        x.fillStyle = color; x.fillRect(0, 0, SZ, SZ);

        x.lineCap = 'butt';
        for (var i = 0; i < 350; i++) {
            var sx = Math.random() * SZ, sy = Math.random() * SZ;
            var len = 3 + Math.random() * 14;
            var ang = 0.7 + (Math.random() - 0.5) * 0.4;   // ~45 deg
            var lw = 0.4 + Math.random() * 1.4;
            var bright = Math.random() > 0.5;
            var cr = bright ? Math.min(255, o.r + 40) : Math.max(0, o.r - 40);
            var cg = bright ? Math.min(255, o.g + 40) : Math.max(0, o.g - 40);
            var cb = bright ? Math.min(255, o.b + 40) : Math.max(0, o.b - 40);
            x.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.04 + Math.random() * 0.14) + ')';
            x.lineWidth = lw;
            x.beginPath(); x.moveTo(sx, sy);
            x.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
            x.stroke();
        }
        /* pixel-level grain */
        var img = x.getImageData(0, 0, SZ, SZ), d = img.data;
        for (var i = 0; i < d.length; i += 4) {
            var n = (Math.random() - 0.5) * 18;
            d[i] = cl(d[i] + n); d[i + 1] = cl(d[i + 1] + n); d[i + 2] = cl(d[i + 2] + n);
        }
        x.putImageData(img, 0, 0);
        return c.toDataURL();
    }

    var texFns = { brush: texBrush, paint: texPaint, circles: texCircles, pencil: texPencil };

    /* Build an SVG <pattern> and return "url(#id)" */
    function mkPattern(id, color, type) {
        var pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pat.setAttribute('id', id);
        pat.setAttribute('patternUnits', 'userSpaceOnUse');
        pat.setAttribute('width', SZ);
        pat.setAttribute('height', SZ);

        var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('width', SZ);
        img.setAttribute('height', SZ);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', (texFns[type] || texBrush)(color));

        pat.appendChild(img);
        defs.appendChild(pat);
        return 'url(#' + id + ')';
    }

    /* ============================================================ */
    /*  Yarn constructor                                            */
    /* ============================================================ */
    function Yarn(cfg, idx) {
        this.word  = cfg.word.toUpperCase();
        this.color = cfg.color;
        this.sw    = cfg.sw;
        this.baseY = H * cfg.yOff;
        this.url   = cfg.url;

        /* Texture pattern */
        this.fill = mkPattern('tex-' + idx, cfg.color, cfg.tex);

        /* 5 control points — endpoints + 3 interior */
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
                speed: 0.004 + Math.random() * 0.008,
                ampX: edge ? 2 : 8 + Math.random() * 15,
                ampY: edge ? 3 : 20 + Math.random() * 30
            });
        }

        /* SVG path */
        this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathEl.setAttribute('class', 'yarn');
        this.pathEl.setAttribute('stroke', this.fill);
        this.pathEl.setAttribute('stroke-width', this.sw);
        yarnGroup.appendChild(this.pathEl);

        /* State */
        this.hovered       = false;
        this.transitioning = false;
        this.hoverRatio    = 0.5;
        this.hoverAmt      = 0;          // smooth 0→1 blend
        this.letters       = [];

        this._mkLetters();
        this._bind();
    }

    /* ---- Letters (15 repeats) ---- */
    Yarn.prototype._mkLetters = function () {
        var chars = this.word.split('');
        var rep = 15;
        for (var i = 0; i < chars.length * rep; i++) {
            var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = chars[i % chars.length];
            el.setAttribute('class', 'yarn-text');
            textGroup.appendChild(el);
            this.letters.push({ el: el, idleRatio: Math.random(), ratio: Math.random() });
        }
    };

    /* ---- Events ---- */
    Yarn.prototype._bind = function () {
        var self = this;

        this.pathEl.addEventListener('mouseenter', function (e) {
            if (isPageOpen) return;
            self.hovered = true;
            self.hoverRatio = e.clientX / W;   // lock at initial position
            yarnGroup.appendChild(self.pathEl); // bring to front
        });
        /* No mousemove — words stay where they formed */

        this.pathEl.addEventListener('mouseleave', function () {
            self.hovered = false;
            self.letters.forEach(function (l) { l.idleRatio = Math.random(); });
        });

        this.pathEl.addEventListener('click', function () {
            if (isPageOpen) return;
            openPage(self);
        });
    };

    /* ---- Path wobble (sine/cosine, always alive) ---- */
    Yarn.prototype.updatePath = function () {
        /* Wobble scale: idle 1.0 → hover 0.4 → transition 0.0 */
        var wScale = this.transitioning ? 0 : (1 - this.hoverAmt * 0.6);

        for (var i = 1; i < this.points.length - 1; i++) {
            var p = this.points[i];
            p.angle += p.speed;
            p.currentX = p.x + Math.cos(p.angle) * p.ampX * wScale;
            p.currentY = p.y + Math.sin(p.angle) * p.ampY * wScale;
        }

        /* Endpoints stay at edges (only y wobbles gently) */
        this.points[0].currentX = 0;
        this.points[4].currentX = W;

        /* Build midpoint-bezier path */
        var pts = this.points;
        var d = 'M ' + pts[0].currentX + ' ' + pts[0].currentY;
        for (var i = 0; i < pts.length - 1; i++) {
            var x1 = pts[i].currentX,   y1 = pts[i].currentY;
            var x2 = pts[i+1].currentX, y2 = pts[i+1].currentY;
            var cpx = x1 + (x2 - x1) / 2;
            d += ' C ' + cpx + ' ' + y1 + ', ' + cpx + ' ' + y2 + ', ' + x2 + ' ' + y2;
        }
        this.pathEl.setAttribute('d', d);

        /* Smooth hover blend + stroke swell */
        var goal = (this.hovered || this.transitioning) ? 1 : 0;
        this.hoverAmt += (goal - this.hoverAmt) * 0.08;
        var sw = this.sw * (1 + this.hoverAmt * 0.15);
        this.pathEl.setAttribute('stroke-width', sw);
    };

    /* ---- Letter positions — tight book-like spacing ---- */
    Yarn.prototype.updateLetters = function () {
        var pathLen = this.pathEl.getTotalLength();
        if (pathLen === 0) return;

        var wl = this.word.length;
        /*
         * charSpacing in pixels then converted to ratio.
         * ~12px per char at book reading density.
         * wordSpacing ~28px between repeated word groups.
         */
        var charPx  = 12;
        var wordPx  = 28;
        var charSp  = charPx / pathLen;
        var wordSp  = wordPx / pathLen;
        var grpLen  = wl * charSp + wordSp;
        var nGroups = this.letters.length / wl;
        var half    = nGroups / 2;
        var h       = this.hoverAmt;

        for (var i = 0; i < this.letters.length; i++) {
            var L = this.letters[i];
            var target = L.idleRatio;

            if (h > 0.05) {
                var gi  = Math.floor(i / wl);
                var ci  = i % wl;
                target = this.hoverRatio
                       + (gi - half) * grpLen
                       + ci * charSp;
            }

            var spd = h > 0.3 ? 0.1 : 0.012;
            L.ratio += (target - L.ratio) * spd;

            /* Wrap around edges */
            if (L.ratio > 1.1)  L.ratio -= 1.2;
            if (L.ratio < -0.1) L.ratio += 1.2;

            var pLen = Math.max(0, Math.min(1, L.ratio)) * pathLen;
            try {
                var pt  = this.pathEl.getPointAtLength(pLen);
                var ptN = this.pathEl.getPointAtLength(Math.min(pathLen, pLen + 2));
                var ang = Math.atan2(ptN.y - pt.y, ptN.x - pt.x) * 180 / Math.PI;

                L.el.setAttribute('x', pt.x);
                L.el.setAttribute('y', pt.y);
                L.el.setAttribute('transform', 'rotate(' + ang + ',' + pt.x + ',' + pt.y + ')');
                L.el.style.opacity = 0.5 + h * 0.5;
            } catch (e) {}
        }
    };

    /* ============================================================ */
    /*  Page transition (GSAP pull → overlay → navigate)            */
    /* ============================================================ */
    function openPage(yarn) {
        isPageOpen = true;
        yarn.transitioning = true;
        overlay.style.backgroundColor = yarn.color;

        var tl = gsap.timeline();

        /* Straighten (pull effect) */
        tl.to(yarn.points, {
            currentY: yarn.baseY,
            currentX: function (i, t) { return t.x; },
            duration: 0.5,
            ease: 'back.out(1.5)'
        }, 0);

        /* Thin yarn */
        tl.to(yarn.pathEl, {
            attr: { 'stroke-width': yarn.sw * 0.35 },
            duration: 0.5,
            ease: 'power2.out'
        }, 0);

        /* Slide overlay */
        tl.to(overlay, {
            x: '0%',
            duration: 1.0,
            ease: 'power4.inOut'
        }, 0.2);

        /* Navigate */
        tl.call(function () { window.location.href = yarn.url; }, null, 1.3);
    }

    /* ============================================================ */
    /*  Init / Loop                                                 */
    /* ============================================================ */
    function build() {
        defs.innerHTML      = '';
        yarnGroup.innerHTML = '';
        textGroup.innerHTML = '';
        yarns = [];
        W = window.innerWidth;
        H = window.innerHeight;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

        DATA.forEach(function (cfg, i) { yarns.push(new Yarn(cfg, i)); });
    }

    function loop() {
        for (var i = 0; i < yarns.length; i++) {
            yarns[i].updatePath();
            yarns[i].updateLetters();
        }
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', function () { build(); });
    build();
    loop();
})();
