export function isMobile() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // common UA check
  const uaMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  // touch support (covers many tablets/phones and some touch laptops)
  const touchSupport = typeof window !== "undefined" && (
    'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
  );

  // small viewport heuristic
  const smallViewport = typeof window !== "undefined" && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

  return uaMobile || touchSupport || smallViewport;
}
