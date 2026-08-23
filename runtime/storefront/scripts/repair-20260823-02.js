import { initRepairRequest as initExistingRepairRequest } from "./repair-20260818-02.js";

const SUBMISSION_STORAGE_KEY = "studiooalum:repair-submission-id";

function createSubmissionId() {
  return `repair:${crypto.randomUUID()}`;
}

function readSubmissionId() {
  try {
    return sessionStorage.getItem(SUBMISSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeSubmissionId(value) {
  try {
    if (value) sessionStorage.setItem(SUBMISSION_STORAGE_KEY, value);
    else sessionStorage.removeItem(SUBMISSION_STORAGE_KEY);
  } catch {}
}

function bindSubmissionId() {
  const form = document.querySelector(".js-repair-form");
  if (!form || form.dataset.submissionIdBound === "true") return;
  form.dataset.submissionIdBound = "true";

  let input = form.querySelector("input[name='submission_id']");
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "submission_id";
    form.append(input);
  }

  form.addEventListener("submit", () => {
    const submissionId = input.value || readSubmissionId() || createSubmissionId();
    input.value = submissionId;
    writeSubmissionId(submissionId);
  }, { capture: true });

  const success = document.querySelector(".js-repair-success");
  if (success) {
    new MutationObserver(() => {
      if (!success.hidden) writeSubmissionId("");
    }).observe(success, { attributes: true, attributeFilter: ["hidden"] });
  }

  document.querySelector(".js-repair-reset")?.addEventListener("click", () => {
    input.value = "";
    writeSubmissionId("");
  });
}

export function initRepairRequest() {
  initExistingRepairRequest();
  bindSubmissionId();
}