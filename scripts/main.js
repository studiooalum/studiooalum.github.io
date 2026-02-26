/* ======================================================
   Studio OALUM — Yarn Menu Interaction
   Letters float inside threads. On hover they gather
   into repeated words evenly along the thread.
====================================================== */

const svgContainer = document.getElementById('svg-container');
const yarnGroup    = document.getElementById('yarn-group');
const textGroup    = document.getElementById('text-group');

let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- data ---------- */
const yarnsData = [
    { word: 'About',      color: '#ffb6c1', strokeWidth: 50,  yOffset: 0.18 },
    { word: 'Archive',    color: '#ff1414',  strokeWidth: 60,  yOffset: 0.42 },
    { word: 'Shop',       color: '#ffd700',  strokeWidth: 42,  yOffset: 0.68 },
    { word: 'Newsletter', color: '#d1e0e3',  strokeWidth: 48,  yOffset: 0.92 },
];

const yarns      = [];
let   isPageOpen = false;
let   activeYarn = null;

/* ====================================================== */
class Yarn {
    constructor(data) {
        this.word        = data.word.toUpperCase();
        this.color       = data.color;
        this.strokeWidth = data.strokeWidth;
        this.baseY       = H * data.yOffset;

        /* --- control points for the bezier path --- */
        const N = 6;                       // number of control points
        this.points = [];
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            const isEdge = i === 0 || i === N - 1;
            const jitterY = isEdge ? 0 : (Math.random() - 0.5) * 250;
            this.points.push({
                baseX : t * W,
                baseY : this.baseY + jitterY,
                currentX : t * W,
                currentY : this.baseY + jitterY,
                /* wobble params (each point unique) */
                phaseX : Math.random() * Math.PI * 2,
                phaseY : Math.random() * Math.PI * 2,
                speedX : 0.003 + Math.random() * 0.006,
                speedY : 0.004 + Math.random() * 0.007,
                ampX   : isEdge ? 3 : 10 + Math.random() * 15,
                ampY   : isEdge ? 5 : 20 + Math.random() * 30,
            });
        }

        /* --- SVG: invisible hit-area path (wider, no filter) --- */
        this.hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.hitPath.setAttribute('stroke', 'transparent');
        this.hitPath.setAttribute('stroke-width', this.strokeWidth + 30);
        this.hitPath.setAttribute('fill', 'none');
        this.hitPath.style.cursor = 'pointer';
        this.hitPath.style.pointerEvents = 'stroke';
        yarnGroup.appendChild(this.hitPath);

        /* --- SVG: visible yarn path --- */
        this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathEl.setAttribute('class', 'yarn');
        this.pathEl.setAttribute('stroke', this.color);
        this.pathEl.setAttribute('stroke-width', this.strokeWidth);
        yarnGroup.appendChild(this.pathEl);

        /* --- state --- */
        this.letters        = [];
        this.isHovered      = false;
        this.isTransitioning = false;
        this.hoverRatio     = 0.5;
        this.hoverAmount    = 0;        // 0 = idle, 1 = fully gathered

        this._initLetters();
        this._bind();
    }

    /* ---------- create letter elements ---------- */
    _initLetters() {
        const chars   = this.word.split('');
        const repeats = 6;                          // word appears ~6 times
        const total   = chars.length * repeats;

        for (let i = 0; i < total; i++) {
            const ch = chars[i % chars.length];
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.textContent = ch;
            el.setAttribute('class', 'yarn-text');
            textGroup.appendChild(el);

            const idleRatio = Math.random();
            const idlePerp  = (Math.random() - 0.5) * 0.8;  // +-40 % of stroke

            this.letters.push({
                el,
                charIdx  : i % chars.length,
                wordIdx  : Math.floor(i / chars.length),
                /* current rendered state */
                curRatio : idleRatio,
                curPerp  : idlePerp,
                curRot   : 0,
                /* idle floating home position */
                idleRatio,
                idlePerp,
                /* per-letter drift oscillators */
                dPhaseR  : Math.random() * Math.PI * 2,
                dSpeedR  : 0.0008 + Math.random() * 0.002,
                dAmpR    : 0.008 + Math.random() * 0.015,
                dPhaseP  : Math.random() * Math.PI * 2,
                dSpeedP  : 0.001 + Math.random() * 0.003,
                dAmpP    : 0.08 + Math.random() * 0.12,
            });
        }
    }

    /* ---------- events ---------- */
    _bind() {
        const onEnter = () => {
            if (isPageOpen) return;
            this.isHovered = true;
            /* bring visible yarn + hit area to front */
            yarnGroup.appendChild(this.hitPath);
            yarnGroup.appendChild(this.pathEl);
        };
        const onMove = (e) => {
            if (!this.isHovered || isPageOpen) return;
            this.hoverRatio = e.clientX / W;
        };
        const onLeave = () => { this.isHovered = false; };
        const onClick = () => { if (!isPageOpen) openPage(this); };

        /* attach to BOTH hit path and visible path */
        [this.hitPath, this.pathEl].forEach(p => {
            p.addEventListener('mouseenter', onEnter);
            p.addEventListener('mousemove',  onMove);
            p.addEventListener('mouseleave', onLeave);
            p.addEventListener('click',      onClick);
        });
    }

    /* ---------- update path shape (wobble) ---------- */
    updatePath() {
        if (!this.isHovered && !this.isTransitioning) {
            this.points.forEach(p => {
                p.phaseX += p.speedX;
                p.phaseY += p.speedY;
                p.currentX = p.baseX + Math.cos(p.phaseX) * p.ampX;
                p.currentY = p.baseY + Math.sin(p.phaseY) * p.ampY;
            });
        }

        const pts = this.points;
        let d = `M ${pts[0].currentX} ${pts[0].currentY}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const ax = pts[i].currentX,   ay = pts[i].currentY;
            const bx = pts[i+1].currentX, by = pts[i+1].currentY;
            const mx = ax + (bx - ax) * 0.5;
            d += ` C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
        }
        this.pathEl.setAttribute('d', d);
        this.hitPath.setAttribute('d', d);
    }

    /* ---------- update letter positions ---------- */
    updateLetters() {
        const pathLen = this.pathEl.getTotalLength();
        if (pathLen === 0) return;

        /* smooth hover blend */
        const goal = (this.isHovered || this.isTransitioning) ? 1 : 0;
        this.hoverAmount += (goal - this.hoverAmount) * 0.07;

        const wordLen    = this.word.length;
        const repeats    = this.letters.length / wordLen;
        const charSp     = 0.022;                           // char-to-char ratio gap
        const wordGap    = 0.05;                             // gap between repeated words
        const wordWidth  = wordLen * charSp + wordGap;

        for (let i = 0; i < this.letters.length; i++) {
            const L = this.letters[i];

            /* --- idle drift --- */
            L.dPhaseR += L.dSpeedR;
            L.dPhaseP += L.dSpeedP;
            const idleR = L.idleRatio + Math.sin(L.dPhaseR) * L.dAmpR;
            const idleP = L.idlePerp  + Math.sin(L.dPhaseP) * L.dAmpP * 0.3;

            /* --- hover target: evenly distributed words --- */
            const center  = repeats / 2;
            const hoverR  = this.hoverRatio
                          + (L.wordIdx - center) * wordWidth
                          + L.charIdx * charSp;
            const hoverP  = 0;                               // snap to center line

            /* --- blend --- */
            const h  = this.hoverAmount;
            const tR = idleR * (1 - h) + hoverR * h;
            const tP = idleP * (1 - h) + hoverP * h;

            const spd = h > 0.5 ? 0.12 : 0.04;
            L.curRatio += (tR - L.curRatio) * spd;
            L.curPerp  += (tP - L.curPerp)  * spd;

            /* clamp to visible portion */
            const r = Math.max(0, Math.min(1, L.curRatio));

            try {
                const pt  = this.pathEl.getPointAtLength(r * pathLen);
                const pt2 = this.pathEl.getPointAtLength(Math.min(pathLen, r * pathLen + 3));
                const dx  = pt2.x - pt.x;
                const dy  = pt2.y - pt.y;
                const ang = Math.atan2(dy, dx);

                /* perpendicular offset */
                const px = -Math.sin(ang) * L.curPerp * this.strokeWidth * 0.5;
                const py =  Math.cos(ang) * L.curPerp * this.strokeWidth * 0.5;

                const fx = pt.x + px;
                const fy = pt.y + py;
                const rd = ang * 180 / Math.PI;

                /* smooth rotation */
                let dRot = rd - L.curRot;
                if (dRot >  180) dRot -= 360;
                if (dRot < -180) dRot += 360;
                L.curRot += dRot * 0.1;

                L.el.setAttribute('x', fx);
                L.el.setAttribute('y', fy);
                L.el.setAttribute('transform', `rotate(${L.curRot},${fx},${fy})`);
                L.el.style.opacity = 0.5 + h * 0.5;

                /* hide letters that drifted completely off-path */
                L.el.style.display = (L.curRatio >= -0.05 && L.curRatio <= 1.05) ? '' : 'none';
            } catch (_) {}
        }
    }
}

/* ==================== init ==================== */
function init() {
    yarnsData.forEach(d => yarns.push(new Yarn(d)));
    animate();
}

function animate() {
    for (const y of yarns) { y.updatePath(); y.updateLetters(); }
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    yarnGroup.innerHTML = '';
    textGroup.innerHTML = '';
    yarns.length = 0;
    init();
});

/* ==================== page transition (GSAP) ==================== */
const pageOverlay    = document.getElementById('page-overlay');
const pageTitle      = document.getElementById('page-title');
const closeBtn       = document.getElementById('close-btn');
const overlayContents = document.querySelectorAll('.overlay-content');

function openPage(yarn) {
    isPageOpen = true;
    activeYarn = yarn;
    yarn.isTransitioning = true;

    pageTitle.textContent = yarn.word;
    pageOverlay.style.backgroundColor = yarn.color;

    const dark = yarn.color === '#ff1414';
    pageOverlay.style.color            = dark ? '#fff' : '#000';
    closeBtn.style.backgroundColor     = dark ? '#fff' : '#000';
    closeBtn.style.color               = dark ? '#000' : '#fff';

    const tl = gsap.timeline();
    tl.to(yarn.points, {
        currentY : yarn.baseY,
        currentX : (_i, t) => t.baseX,
        duration : 0.5,
        ease     : 'back.out(1.5)'
    }, 0);
    tl.to(yarn.pathEl, {
        attr: { 'stroke-width': yarn.strokeWidth * 0.3 },
        duration: 0.5, ease: 'power2.out'
    }, 0);
    tl.to(pageOverlay, { x: '0%', duration: 1.2, ease: 'power4.inOut' }, 0.2);
    tl.to(overlayContents, {
        y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out'
    }, 0.8);
}

function closePage() {
    if (!isPageOpen) return;
    const tl = gsap.timeline({
        onComplete() {
            isPageOpen = false;
            if (activeYarn) {
                gsap.to(activeYarn.pathEl, {
                    attr: { 'stroke-width': activeYarn.strokeWidth },
                    duration: 0.5, ease: 'power2.out'
                });
                activeYarn.isTransitioning = false;
                activeYarn.isHovered = false;
                activeYarn = null;
            }
        }
    });
    tl.to(overlayContents, { y: -30, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0);
    tl.to(pageOverlay,     { x: '100%', duration: 1, ease: 'power4.inOut' }, 0.2);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePage(); });

/* go */
init();
