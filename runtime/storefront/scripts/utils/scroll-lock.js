const activeLocks = new Set();

let lockedScrollY = 0;

function syncBodyLockState() {
  if (!document.body) return;

  if (activeLocks.size === 0) {
    document.body.classList.remove("is-scroll-locked");
    document.body.style.removeProperty("--scroll-lock-top");
    document.body.style.removeProperty("--scroll-lock-scrollbar-gap");
    window.scrollTo(0, lockedScrollY);
    lockedScrollY = 0;
    return;
  }

  lockedScrollY = window.scrollY || window.pageYOffset || 0;
  const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

  document.body.style.setProperty("--scroll-lock-top", `${-lockedScrollY}px`);
  document.body.style.setProperty("--scroll-lock-scrollbar-gap", `${scrollbarGap}px`);
  document.body.classList.add("is-scroll-locked");
}

export function lockBodyScroll(key = "global") {
  const token = String(key || "global");
  if (activeLocks.has(token)) return;

  activeLocks.add(token);
  if (activeLocks.size > 1) return;

  syncBodyLockState();
}

export function unlockBodyScroll(key = "global") {
  const token = String(key || "global");
  if (!activeLocks.has(token)) return;

  activeLocks.delete(token);
  if (activeLocks.size > 0) return;

  syncBodyLockState();
}