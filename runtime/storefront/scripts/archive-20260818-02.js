import { initArchiveBoard as initExistingArchiveBoard } from "./archive-20260818-01.js?v=20260925-01";

function linkifyDetailTags() {
  document.querySelectorAll(".archive-detail-tags").forEach((row) => {
    const rawTags = row.textContent || "";
    const tags = rawTags.split(/\s*·\s*/).map((tag) => tag.trim()).filter(Boolean);
    if (!tags.length) return;

    const children = [];
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

  const relatedHeading = document.querySelector(".archive-related h2");
  if (relatedHeading) relatedHeading.textContent = "you may also like";
}
