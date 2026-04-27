export function initNewsletterForm() {
  const form = document.getElementById("newsletterForm");
  const status = document.getElementById("newsletterFormStatus");

  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const agreed = formData.get("agree") === "on";

    status.classList.remove("is-error", "is-success");

    if (!email) {
      status.textContent = "이메일을 입력해주세요.";
      status.classList.add("is-error");
      return;
    }

    if (!agreed) {
      status.textContent = "수신 동의 후 신청할 수 있습니다.";
      status.classList.add("is-error");
      return;
    }

    status.textContent = `${name || "구독자"}님, 구독 신청이 접수되었습니다. 실제 발송 기능은 준비 중입니다.`;
    status.classList.add("is-success");
    form.reset();
  });
}