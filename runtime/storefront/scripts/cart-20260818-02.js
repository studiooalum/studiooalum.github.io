import { closeCart, initCartUI as initExistingCartUI } from "./cart-20260706-06.js";

export * from "./cart-20260706-06.js";

let escapeListenerBound = false;
let titleRoleObserver = null;

const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/;

function bindEscapeToClose() {
  if (escapeListenerBound) return;
  escapeListenerBound = true;

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("cart-open")) {
      closeCart();
    }
  });
}

function syncCartTitleRoles() {
  document.querySelectorAll(".cart-item__title").forEach((title) => {
    title.classList.toggle("cart-item__title--english", !HANGUL_PATTERN.test(title.textContent || ""));
  });
}

function bindCartTitleRoles() {
  const items = document.querySelector("#cartItems");
  if (!items) return;

  syncCartTitleRoles();
  if (titleRoleObserver) return;

  titleRoleObserver = new MutationObserver(syncCartTitleRoles);
  titleRoleObserver.observe(items, { childList: true, subtree: true, characterData: true });
}

export function initCartUI() {
  initExistingCartUI();
  bindEscapeToClose();
  bindCartTitleRoles();
}