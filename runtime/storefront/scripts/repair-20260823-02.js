import { initRepairRequest as initExistingRepairRequest } from "./repair-20260818-02.js?v=20260825-01";

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

async function loadRepairStudioContent() {
  try {
    const response = await fetch("./api/repairs/content", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.content) return;
    const content = payload.content;
    const title = document.querySelector("#repair-title");
    const body = document.querySelector(".repair-body-copy");
    const button = document.querySelector("#repairApplyBtn");
    if (title && content.title) title.textContent = content.title;
    if (body && content.lead && Array.isArray(content.paragraphs) && content.paragraphs.length) {
      body.replaceChildren();
      const lead = document.createElement("p");
      lead.className = "repair-body-copy__lead";
      lead.textContent = content.lead;
      body.append(lead, ...content.paragraphs.map((text) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        return paragraph;
      }));
    }
    if (button && content.ctaLabel) button.textContent = content.ctaLabel;
  } catch {}
}

export function initRepairRequest() {
  initExistingRepairRequest();
  bindSubmissionId();
  void loadRepairStudioContent();
}