import { initSiteChrome as initExistingSiteChrome } from "./siteChrome-20260816-02.js";

function createRepairAction() {
  const action = document.createElement("a");
  action.className = "gnb__action gnb__action--repair";
  action.href = "./repair.html";
  action.dataset.gnbRepairAction = "true";
  action.textContent = "Repair Studio";
  return action;
}

function ensureRepairAction(container) {
  let action = container.querySelector("[data-gnb-repair-action], .gnb__action[href$='repair.html']");

  if (!action) {
    action = createRepairAction();
    container.prepend(action);
    return;
  }

  action.classList.add("gnb__action--repair");
  action.dataset.gnbRepairAction = "true";
  action.textContent = "Repair Studio";
}

function ensureRepairActions() {
  document.querySelectorAll(".gnb").forEach((nav) => {
    let desktopActions = nav.querySelector(".gnb__actions");

    if (!desktopActions) {
      const primary = nav.querySelector(".gnb__primary");
      if (!primary) return;

      desktopActions = document.createElement("div");
      desktopActions.className = "gnb__actions";
      primary.after(desktopActions);
    }

    ensureRepairAction(desktopActions);

    const mobilePanel = nav.querySelector(".gnb__mobile-panel");
    if (!mobilePanel) return;

    let mobileActions = mobilePanel.querySelector(".gnb__mobile-actions");
    if (!mobileActions) {
      mobileActions = document.createElement("div");
      mobileActions.className = "gnb__mobile-actions";
      mobilePanel.append(mobileActions);
    }

    ensureRepairAction(mobileActions);
  });
}

export function initSiteChrome(options) {
  initExistingSiteChrome(options);
  ensureRepairActions();
  window.addEventListener("studiooalum:nav-updated", ensureRepairActions);
}