const svgContainer = document.getElementById('svg-container');
const yarnGroup = document.getElementById('yarn-group');
const textGroup = document.getElementById('text-group');

let width = window.innerWidth;
let height = window.innerHeight;

const yarnsData = [
    { word: "About", color: "#ffb6c1", strokeWidth: 45, yOffset: 0.2 },
    { word: "Archive", color: "#ff1414", strokeWidth: 55, yOffset: 0.5 },
    { word: "Shop", color: "#ffd700", strokeWidth: 35, yOffset: 0.7 },
    { word: "Newsletter", color: "#d1e0e3", strokeWidth: 40, yOffset: 0.9 }
];

const yarns = [];
let isPageOpen = false;
let activeYarn = null;

class Yarn {
    constructor(data, index) {
        this.word = data.word.toUpperCase();
        this.color = data.color;
        this.strokeWidth = data.strokeWidth;
        this.baseY = height * data.yOffset;

        this.points = [
            { x: 0, y: this.baseY, angle: Math.random() * Math.PI * 2, speed: 0.01 + Math.random() * 0.01 },
            { x: width * 0.25, y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * Math.PI * 2, speed: 0.005 + Math.random() * 0.01 },
            { x: width * 0.5, y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * Math.PI * 2, speed: 0.008 + Math.random() * 0.01 },
            { x: width * 0.75, y: this.baseY - 100 + Math.random() * 200, angle: Math.random() * Math.PI * 2, speed: 0.006 + Math.random() * 0.01 },
            { x: width, y: this.baseY, angle: Math.random() * Math.PI * 2, speed: 0.01 + Math.random() * 0.01 }
        ];

        this.points.forEach(p => {
            p.currentX = p.x;
            p.currentY = p.y;
        });

        this.pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathElement.setAttribute('class', 'yarn');
        this.pathElement.setAttribute('stroke', this.color);
        this.pathElement.setAttribute('stroke-width', this.strokeWidth);
        yarnGroup.appendChild(this.pathElement);

        this.letters = [];
        this.isHovered = false;
        this.isTransitioning = false;
        this.hoverRatio = 0.5;

        this.initLetters();
        this.addEventListeners();
    }

    initLetters() {
        const chars = this.word.split('');
        const repeatCount = 10;

        for (let i = 0; i < chars.length * repeatCount; i++) {
            const char = chars[i % chars.length];
            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.textContent = char;
            textEl.setAttribute('class', 'yarn-text');
            textGroup.appendChild(textEl);

            this.letters.push({
                el: textEl,
                char: char,
                targetRatioIdle: Math.random(),
                currentRatio: Math.random()
            });
        }
    }

    addEventListeners() {
        this.pathElement.addEventListener('mouseenter', () => {
            if (isPageOpen) return;
            this.isHovered = true;
            yarnGroup.appendChild(this.pathElement);
        });

        this.pathElement.addEventListener('mousemove', (e) => {
            if (!this.isHovered || isPageOpen) return;
            this.hoverRatio = e.clientX / width;
        });

        this.pathElement.addEventListener('mouseleave', () => {
            this.isHovered = false;
            this.letters.forEach(l => {
                l.targetRatioIdle = Math.random();
            });
        });

        this.pathElement.addEventListener('click', () => {
            if (isPageOpen) return;
            openPage(this);
        });
    }

    updatePath() {
        if (!this.isHovered && !this.isTransitioning) {
            this.points.forEach((p, i) => {
                if (i > 0 && i < this.points.length - 1) {
                    p.angle += p.speed;
                    p.currentY = p.y + Math.sin(p.angle) * 30;
                    p.currentX = p.x + Math.cos(p.angle) * 15;
                }
            });
        }

        const p = this.points;
        let d = `M ${p[0].x} ${p[0].currentY} `;

        for (let i = 0; i < p.length - 1; i++) {
            const x1 = p[i].currentX;
            const y1 = p[i].currentY;
            const x2 = p[i + 1].currentX;
            const y2 = p[i + 1].currentY;

            const cp1x = x1 + (x2 - x1) / 2;
            const cp1y = y1;
            const cp2x = x1 + (x2 - x1) / 2;
            const cp2y = y2;

            d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2} `;
        }

        this.pathElement.setAttribute('d', d);
    }

    updateLetters() {
        const pathLength = this.pathElement.getTotalLength();
        if (pathLength === 0) return;

        const charSpacing = 0.02;
        const wordSpacing = 0.06;
        const totalWordLength = (this.word.length * charSpacing) + wordSpacing;

        for (let i = 0; i < this.letters.length; i++) {
            const letter = this.letters[i];
            let targetRatio = letter.targetRatioIdle;

            if (this.isHovered || this.isTransitioning) {
                const wordGroupIndex = Math.floor(i / this.word.length);
                const charInWordIndex = i % this.word.length;

                targetRatio = this.hoverRatio
                    + ((wordGroupIndex - 5) * totalWordLength)
                    + (charInWordIndex * charSpacing);
            }

            const lerpSpeed = (this.isHovered || this.isTransitioning) ? 0.08 : 0.01;
            letter.currentRatio += (targetRatio - letter.currentRatio) * lerpSpeed;

            if (letter.currentRatio > 1.1) letter.currentRatio -= 1.2;
            if (letter.currentRatio < -0.1) letter.currentRatio += 1.2;

            const pointLength = Math.max(0, Math.min(1, letter.currentRatio)) * pathLength;

            try {
                const point = this.pathElement.getPointAtLength(pointLength);
                const pointAhead = this.pathElement.getPointAtLength(Math.min(pathLength, pointLength + 2));
                const angle = Math.atan2(pointAhead.y - point.y, pointAhead.x - point.x) * (180 / Math.PI);

                letter.el.setAttribute('x', point.x);
                letter.el.setAttribute('y', point.y);
                letter.el.setAttribute('transform', `rotate(${angle}, ${point.x}, ${point.y})`);

                letter.el.style.opacity = (this.isHovered || this.isTransitioning) ? 1 : 0.6;
            } catch (e) {}
        }
    }
}

function init() {
    yarnsData.forEach((data, index) => {
        yarns.push(new Yarn(data, index));
    });
    animate();
}

function animate() {
    yarns.forEach(yarn => {
        yarn.updatePath();
        yarn.updateLetters();
    });
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    yarnGroup.innerHTML = '';
    textGroup.innerHTML = '';
    yarns.length = 0;
    init();
});

const pageOverlay = document.getElementById('page-overlay');
const pageTitle = document.getElementById('page-title');
const closeBtn = document.getElementById('close-btn');
const overlayContents = document.querySelectorAll('.overlay-content');

function openPage(yarn) {
    isPageOpen = true;
    activeYarn = yarn;
    yarn.isTransitioning = true;

    pageTitle.textContent = yarn.word;
    pageOverlay.style.backgroundColor = yarn.color;

    const isDarkColor = (yarn.color === '#ff1414');
    const textColor = isDarkColor ? '#ffffff' : '#000000';
    const btnBgColor = isDarkColor ? '#ffffff' : '#000000';
    const btnTextColor = isDarkColor ? '#000000' : '#ffffff';

    pageOverlay.style.color = textColor;
    closeBtn.style.backgroundColor = btnBgColor;
    closeBtn.style.color = btnTextColor;

    const tl = gsap.timeline();

    tl.to(yarn.points, {
        currentY: yarn.baseY,
        currentX: (i, target) => target.x,
        duration: 0.5,
        ease: "back.out(1.5)"
    }, 0);

    tl.to(yarn.pathElement, {
        attr: { 'stroke-width': yarn.strokeWidth * 0.4 },
        duration: 0.5,
        ease: "power2.out"
    }, 0);

    tl.to(pageOverlay, {
        x: "0%",
        duration: 1.2,
        ease: "power4.inOut"
    }, 0.2);

    tl.to(overlayContents, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out"
    }, 0.8);
}

function closePage() {
    if (!isPageOpen) return;

    const tl = gsap.timeline({
        onComplete: () => {
            isPageOpen = false;
            if (activeYarn) {
                gsap.to(activeYarn.pathElement, {
                    attr: { 'stroke-width': activeYarn.strokeWidth },
                    duration: 0.5,
                    ease: "power2.out"
                });

                activeYarn.isTransitioning = false;
                activeYarn.isHovered = false;
                activeYarn = null;
            }
        }
    });

    tl.to(overlayContents, {
        y: -30,
        opacity: 0,
        duration: 0.4,
        ease: "power2.in"
    }, 0);

    tl.to(pageOverlay, {
        x: "100%",
        duration: 1,
        ease: "power4.inOut"
    }, 0.2);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePage();
});

init();
