import { initArchiveBoard as initExistingArchiveBoard } from "./archive-20260816-06.js";

export async function initArchiveBoard() {
  await initExistingArchiveBoard();

  const back = document.querySelector(".archive-detail-back");
  if (!back) return;

  back.textContent = "←";
  back.setAttribute("aria-label", "Archive 목록으로 돌아가기");
}