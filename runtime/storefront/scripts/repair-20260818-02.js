import { initRepairRequest as initExistingRepairRequest } from "./repair-20260818-01.js?v=20260825-01";

function initRepairPricePanelMinHeight() {
  const panels = Array.from(document.querySelectorAll("[data-repair-price-panel]"));
  const details = panels[0]?.closest("details");
  if (panels.length < 2 || !details) return;

  let frameId = null;

  const syncMinHeight = () => {
    frameId = null;

    const wasOpen = details.open;
    const hiddenStates = panels.map((panel) => panel.hidden);
    if (!wasOpen) details.open = true;

    panels.forEach((panel) => {
      panel.hidden = false;
      panel.style.setProperty("--repair-price-panel-min-height", "0px");
    });

    const minHeight = Math.ceil(Math.max(...panels.map((panel) => panel.getBoundingClientRect().height)));

    panels.forEach((panel, index) => {
      panel.hidden = hiddenStates[index];
      panel.style.setProperty("--repair-price-panel-min-height", `${minHeight}px`);
    });

    if (!wasOpen) details.open = false;
  };

  const scheduleMinHeightSync = () => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(syncMinHeight);
  };

  details.addEventListener("toggle", scheduleMinHeightSync);
  document.querySelectorAll("[data-repair-price-tab]").forEach((button) => {
    button.addEventListener("click", scheduleMinHeightSync);
  });
  window.addEventListener("resize", scheduleMinHeightSync);
  document.fonts?.ready.then(scheduleMinHeightSync).catch(() => {});
  scheduleMinHeightSync();
}

export function initRepairRequest() {
  initExistingRepairRequest();
  initRepairPricePanelMinHeight();
}