import { initSiteChrome as initLegacySiteChrome } from "./siteChrome-20260820-01.js";

function normalizeRepairLabel() {
  document.querySelectorAll(".gnb a, .gnb button").forEach((element) => {
    if (element.textContent.trim() === "Repair Store") {
      element.textContent = "Repair Studio";
    }
  });
}

export function initSiteChrome(options) {
  initLegacySiteChrome(options);
  normalizeRepairLabel();
  window.addEventListener("studiooalum:nav-updated", normalizeRepairLabel);
}
