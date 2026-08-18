import { initArchiveBoard as initExistingArchiveBoard } from "./archive-20260818-01.js";

function linkifyDetailTags() {
  document.querySelectorAll(".archive-detail-meta__more p").forEach((row) => {
    const label = row.querySelector(":scope > span");
    if (label?.textContent.trim() !== "Tags") return;

    const rawTags = Array.from(row.childNodes)
      .filter((node) => node !== label)
      .map((node) => node.textContent)
      .join("");
    const tags = rawTags.split(/\s*·\s*/).map((tag) => tag.trim()).filter(Boolean);
    if (!tags.length) return;

    const children = [label];
    tags.forEach((tag, index) => {
      if (index) children.push(document.createTextNode(" · "));

      const link = document.createElement("a");
      link.className = "archive-detail-tag";
      link.href = `./archive.html?tag=${encodeURIComponent(tag)}`;
      link.textContent = tag;
      children.push(link);
    });
    row.replaceChildren(...children);
  });
}

export async function initArchiveBoard() {
  await initExistingArchiveBoard();
  linkifyDetailTags();
}