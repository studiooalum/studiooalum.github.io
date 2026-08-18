import { initSiteChrome as initExistingSiteChrome } from "./siteChrome-20260818-01.js";

function normalizeRepairLabel() {
  document.querySelectorAll(".gnb__action--repair").forEach((action) => {
    action.textContent = "Repair";
  });
}

export function initSiteChrome(options) {
  initExistingSiteChrome(options);
  normalizeRepairLabel();
  window.addEventListener("studiooalum:nav-updated", normalizeRepairLabel);
}