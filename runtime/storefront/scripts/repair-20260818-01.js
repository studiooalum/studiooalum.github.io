import { initRepairRequest as initExistingRepairRequest } from "./repair-20260817-05.js?v=20260825-01";

function initRepairInfoAccordions() {
  const accordions = Array.from(document.querySelectorAll(".repair-stage__rail details"));
  if (!accordions.length) return;

  const priceAccordion = accordions.find((accordion) => accordion.querySelector("[data-repair-price-panel]"));
  if (priceAccordion) priceAccordion.open = false;

  accordions.forEach((accordion) => {
    accordion.addEventListener("toggle", () => {
      if (!accordion.open) return;
      accordions.forEach((otherAccordion) => {
        if (otherAccordion !== accordion && otherAccordion.open) otherAccordion.open = false;
      });
    });
  });
}

export function initRepairRequest() {
  initExistingRepairRequest();
  initRepairInfoAccordions();
}