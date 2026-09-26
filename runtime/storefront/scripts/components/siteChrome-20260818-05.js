import { initSiteChrome as initExistingSiteChrome } from "./siteChrome-20260818-04.js";

const pointerHoverSelector = [
  ".archive-card",
  ".newsletter-post-card",
  ".account-btn:not(.account-btn--secondary):not(.account-btn--signup)",
  ".edition-btn:not(.edition-btn--secondary)",
  ".checkout-submit-btn",
  ".newsletter-form__button",
  ".payment-submit-btn",
  ".payment-btn--secondary",
  ".repair-apply-btn",
  ".repair-submit",
  ".repair-success__reset",
  ".repair-ticket-submit",
  ".workshop-apply-btn",
  ".workshop-booking-form__submit",
  ".workshop-inquiry-form button[type='submit']",
  ".cart-panel__checkout-btn",
  ".placeholder-form__button",
  ".fulfillment-btn:not(.fulfillment-btn--secondary)",
].join(",");

let pointerHoverInstalled = false;

function getPointerHoverTarget(target) {
  return target instanceof Element ? target.closest(pointerHoverSelector) : null;
}

function installPointerHover() {
  if (pointerHoverInstalled) return;
  pointerHoverInstalled = true;

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    getPointerHoverTarget(event.target)?.classList.add("is-pointer-hover");
  });

  document.addEventListener("pointerout", (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const target = getPointerHoverTarget(event.target);
    if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
    target.classList.remove("is-pointer-hover");
  });
}

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
  installPointerHover();
  normalizeActions();
  window.addEventListener("studiooalum:nav-updated", normalizeActions);
}
