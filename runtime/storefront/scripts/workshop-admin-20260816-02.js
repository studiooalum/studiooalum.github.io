async function startWorkshopAdmin() {
	document.querySelectorAll("[data-workshop-admin-auth-guard]").forEach((element) => {
		element.hidden = false;
	});

	try {
		await import("./workshop-admin-20260809-03.js?v=20260818-01");
	} catch (error) {
		console.error("Failed to initialize Workshop Admin.", error);
		const status = document.querySelector(".js-workshop-admin-auth-status");
		if (status) {
			status.removeAttribute("data-admin-login-only");
			status.textContent = "워크숍 관리 화면을 불러오지 못했습니다. 페이지를 새로고침해주세요.";
			status.classList.add("is-error");
		}
	}
}

if (document.documentElement.classList.contains("admin-session-ready")) {
	void startWorkshopAdmin();
} else {
	window.addEventListener("studiooalum:admin-session-ready", () => void startWorkshopAdmin(), { once: true });
}
