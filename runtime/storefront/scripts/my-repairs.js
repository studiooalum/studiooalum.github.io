const dom = {
  status: document.querySelector(".js-my-repairs-status"),
  list: document.querySelector(".js-my-repairs-list"),
  filters: Array.from(document.querySelectorAll("[data-repair-filter]")),
};

const state = { repairs: [], filter: "all" };

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function matchesFilter(repair) {
  if (state.filter === "all") return true;
  if (state.filter === "active") return ["item_received", "in_progress", "payment_pending", "shipping"].includes(repair.status);
  if (state.filter === "exception") return ["cancelled", "rejected"].includes(repair.status);
  return repair.status === state.filter;
}

function ticketHref(repair) {
  if (repair.ticketShortCode) return `/t/${encodeURIComponent(repair.ticketShortCode)}`;
  if (repair.ticketId) return `/repair-ticket.html?ticket=${encodeURIComponent(repair.ticketId)}`;
  return "";
}

function render() {
  const repairs = state.repairs.filter(matchesFilter);
  if (!repairs.length) {
    dom.list.innerHTML = '<p class="my-repairs-empty">해당 상태의 수선 내역이 없습니다.</p>';
    return;
  }
  dom.list.innerHTML = repairs.map((repair) => {
    const href = ticketHref(repair);
    const number = repair.ticketNumberLabel || repair.requestNumber || "-";
    return `<article class="my-repair-row">
      <p class="my-repair-row__number">${escapeHtml(number)}</p>
      <div class="my-repair-row__body">
        <h2 class="my-repair-row__title">${escapeHtml(repair.itemType || "수선 의뢰")}</h2>
        <p class="my-repair-row__meta">${escapeHtml(repair.statusLabel || repair.status || "신청 완료")} · ${escapeHtml(formatDate(repair.createdAt))}</p>
      </div>
      ${href ? `<a class="my-repair-row__link" href="${href}">Repair Ticket</a>` : ""}
    </article>`;
  }).join("");
}

async function load() {
  try {
    const response = await fetch("/api/auth/account", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.authenticated) {
      if (response.status === 401) {
        dom.status.textContent = "로그인 후 수선 내역을 확인할 수 있습니다.";
        dom.list.innerHTML = '<p class="my-repairs-empty"><a class="my-repairs-login" href="/account">My Oalum 로그인</a></p>';
        return;
      }
      throw new Error(payload?.error || "수선 내역을 불러오지 못했습니다.");
    }
    state.repairs = Array.isArray(payload.account?.repairRequests) ? payload.account.repairRequests : [];
    dom.status.textContent = state.repairs.length >= 100 ? "최근 100건" : `${state.repairs.length}건`;
    render();
  } catch (error) {
    dom.status.textContent = error.message || "수선 내역을 불러오지 못했습니다.";
    dom.list.innerHTML = '<p class="my-repairs-empty">잠시 후 다시 시도해주세요.</p>';
  }
}

dom.filters.forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.repairFilter || "all";
  dom.filters.forEach((item) => item.classList.toggle("is-active", item === button));
  render();
}));

void load();