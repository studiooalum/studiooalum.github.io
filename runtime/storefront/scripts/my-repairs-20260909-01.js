const PROGRESS_STATUSES = new Set(["received", "item_received", "in_progress", "payment_pending", "shipping"]);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTicketNumber(request, fallbackNumber) {
  const ticketNumber = Number(request?.ticketNumber || 0);
  if (Number.isInteger(ticketNumber) && ticketNumber > 0) {
    return `#${String(ticketNumber).padStart(3, "0")}`;
  }
  return `#${String(Math.max(1, fallbackNumber)).padStart(3, "0")}`;
}

function getFilterGroup(request) {
  const status = String(request?.status || "").toLowerCase();
  if (status === "closed") return "done";
  if (PROGRESS_STATUSES.has(status)) return "progress";
  return "other";
}

function renderRepairCard(request, fallbackNumber) {
  const ticketNumber = formatTicketNumber(request, fallbackNumber);
  const ticketHref = request?.ticketId
    ? `./repair-ticket.html?ticket=${encodeURIComponent(request.ticketId)}`
    : "";
  const image = Array.isArray(request?.images) ? request.images[0] : null;
  const imageMarkup = image?.streamPath
    ? `<img class="my-repair-ticket__image" src="${escapeHtml(image.streamPath)}" alt="${escapeHtml(request?.itemType || "수선 의뢰")}" loading="lazy">`
    : '<span class="my-repair-ticket__image-fallback" aria-hidden="true">REPAIR</span>';
  const statusGroup = getFilterGroup(request);
  const statusLabel = request?.statusLabel || (statusGroup === "done" ? "수선 완료" : "수선 진행중");
  const tagName = ticketHref ? "a" : "article";
  const href = ticketHref ? ` href="${ticketHref}"` : "";
  const unread = Number(request?.unreadCustomerCount || 0);

  return `
    <${tagName} class="my-repair-ticket"${href} data-repair-group="${statusGroup}">
      <span class="my-repair-ticket__stub">
        <span class="my-repair-ticket__label">TICKET</span>
        <strong class="my-repair-ticket__number">${escapeHtml(ticketNumber)}</strong>
      </span>
      ${imageMarkup}
      <div class="my-repair-ticket__body">
        <h2 class="my-repair-ticket__item">${escapeHtml(request?.itemType || "수선 의뢰")}</h2>
        <span class="my-repair-ticket__description">${escapeHtml(request?.issueDescription || "접수된 수선 내용을 Repair Ticket에서 확인해보세요.")}</span>
      </div>
      <dl class="my-repair-ticket__meta">
        <div><dt>RECEIVED</dt><dd>${escapeHtml(formatDate(request?.createdAt))}</dd></div>
        <div><dt>STATUS</dt><dd class="my-repair-ticket__status">${escapeHtml(statusLabel)}${unread ? ` · 새 메시지 ${unread}` : ""}</dd></div>
      </dl>
      <span class="my-repair-ticket__arrow" aria-hidden="true">→</span>
    </${tagName}>
  `;
}

export function initMyRepairs() {
  const listEl = document.querySelector(".js-my-repairs-list");
  const summaryEl = document.querySelector(".js-my-repairs-summary");
  const filterButtons = Array.from(document.querySelectorAll("[data-repair-filter]"));
  const totalEl = document.querySelector(".js-my-repairs-total");
  const progressEl = document.querySelector(".js-my-repairs-progress");
  const doneEl = document.querySelector(".js-my-repairs-done");
  if (!listEl) return;

  let repairs = [];
  let activeFilter = "all";

  function render() {
    const visible = activeFilter === "all"
      ? repairs
      : repairs.filter((request) => getFilterGroup(request) === activeFilter);
    if (!visible.length) {
      listEl.innerHTML = repairs.length
        ? '<div class="my-repairs-empty">해당 상태의 수선 기록이 없습니다.</div>'
        : '<div class="my-repairs-empty">아직 등록된 수선 기록이 없습니다. <a href="./repair.html">Repair Studio에서 수선을 신청할 수 있습니다.</a></div>';
      return;
    }
    listEl.innerHTML = visible.map((request, index) => renderRepairCard(request, repairs.length - repairs.indexOf(request))).join("");
  }

  function updateCounts() {
    const progress = repairs.filter((request) => getFilterGroup(request) === "progress").length;
    const done = repairs.filter((request) => getFilterGroup(request) === "done").length;
    if (totalEl) totalEl.textContent = repairs.length.toLocaleString("ko-KR");
    if (progressEl) progressEl.textContent = progress.toLocaleString("ko-KR");
    if (doneEl) doneEl.textContent = done.toLocaleString("ko-KR");
    if (summaryEl) summaryEl.textContent = `TOTAL ${repairs.length} · 수선 진행중 ${progress} · 수선 완료 ${done}`;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.repairFilter || "all";
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
  });

  fetch("./api/auth/account", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.authenticated) {
        throw Object.assign(new Error(payload?.error || "로그인이 필요합니다."), { status: response.status });
      }
      repairs = Array.isArray(payload?.account?.repairRequests) ? payload.account.repairRequests : [];
      updateCounts();
      render();
    })
    .catch((error) => {
      const requiresLogin = Number(error?.status || 0) === 401;
      if (summaryEl) summaryEl.textContent = requiresLogin ? "로그인 후 수선 기록을 확인할 수 있습니다." : "수선 기록을 불러오지 못했습니다.";
      listEl.innerHTML = requiresLogin
        ? '<div class="my-repairs-empty">My Repairs를 확인하려면 <a href="./account.html">로그인해주세요.</a></div>'
        : '<div class="my-repairs-empty">수선 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
    });
}
