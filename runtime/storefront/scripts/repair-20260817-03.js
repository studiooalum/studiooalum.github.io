import { initRepairRequest as initCurrentRepairRequest } from "./repair-20260817-02.js";

function initBudgetNoteHint() {
  const input = document.querySelector(".js-repair-budget-note");
  const hint = document.querySelector(".repair-request-form__hint");
  if (!input || !hint) return;

  const sync = () => {
    const hasContent = input.value.trim().length > 0;
    hint.hidden = hasContent;
  };

  input.addEventListener("input", sync);
  input.form?.addEventListener("reset", () => requestAnimationFrame(sync));
  sync();
}

export function initRepairRequest() {
  initCurrentRepairRequest();
  initBudgetNoteHint();
}