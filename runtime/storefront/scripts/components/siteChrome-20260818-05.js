import { initSiteChrome as initExistingSiteChrome } from "./siteChrome-20260818-04.js";

function normalizeActions() {
  document.querySelectorAll(".gnb__mobile-actions").forEach((actions) => {
    actions.querySelectorAll(".gnb__action--repair").forEach((action) => {
      action.textContent = "Repair Studio";
    });
  });
  document.querySelectorAll(".gnb [data-auth-toggle='logout']").forEach((action) => action.remove());
}

export function initSiteChrome(options) {
  initExistingSiteChrome(options);
  normalizeActions();
  window.addEventListener("studiooalum:nav-updated", normalizeActions);
}
