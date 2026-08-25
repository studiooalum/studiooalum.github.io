import { initRepairRequest as initExistingRepairRequest } from "./repair-20260817-04.js?v=20260825-01";

function initRepairPricePanelHeight() {
  const panels = Array.from(document.querySelectorAll("[data-repair-price-panel]"));
  const details = panels[0]?.closest("details");
  if (panels.length < 2 || !details) return;

  let frameId = null;

  const syncHeight = () => {
    frameId = null;
    if (!details.open) return;

    const hiddenStates = panels.map((panel) => panel.hidden);
    panels.forEach((panel) => {
      panel.hidden = false;
      panel.style.setProperty("--repair-price-panel-height", "0px");
    });

    const panelHeight = Math.ceil(Math.max(...panels.map((panel) => panel.getBoundingClientRect().height)));

    panels.forEach((panel, index) => {
      panel.hidden = hiddenStates[index];
      panel.style.setProperty("--repair-price-panel-height", `${panelHeight}px`);
    });
  };

  const scheduleHeightSync = () => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(syncHeight);
  };

  details.addEventListener("toggle", scheduleHeightSync);
  document.querySelectorAll("[data-repair-price-tab]").forEach((button) => {
    button.addEventListener("click", syncHeight, true);
  });
  window.addEventListener("resize", scheduleHeightSync);
  document.fonts?.ready.then(scheduleHeightSync).catch(() => {});
  scheduleHeightSync();
}

function initRepairImageDropZone() {
  const dropZone = document.querySelector(".js-repair-image-dropzone");
  const input = document.querySelector(".js-repair-image-input");
  if (!dropZone || !(input instanceof HTMLInputElement)) return;

  let dragDepth = 0;

  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  dropZone.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.classList.remove("is-dragging");
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("is-dragging");

    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    try {
      const dataTransfer = new DataTransfer();
      Array.from(files).forEach((file) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      input.click();
    }
  });
}

export function initRepairRequest() {
  initExistingRepairRequest();
  initRepairPricePanelHeight();
  initRepairImageDropZone();
}