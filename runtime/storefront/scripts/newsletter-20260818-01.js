import { initNewsletterPage as initExistingNewsletterPage } from "./newsletter-20260817-05.js";

export async function initNewsletterPage() {
  await initExistingNewsletterPage();

  const back = document.querySelector(".newsletter-entry__back");
  if (!back) return;

  back.textContent = "←";
  back.setAttribute("aria-label", "모든 Newsletter 글로 돌아가기");
}