/* =========================
   fail.js — Payment failure page
   Reads error code and message from URL params.
========================= */

const urlParams   = new URLSearchParams(window.location.search);
const errorCode   = urlParams.get("code");
const errorMessage = urlParams.get("message");

document.getElementById("errorCode").textContent    = errorCode    || "UNKNOWN";
document.getElementById("errorMessage").textContent = errorMessage || "알 수 없는 오류가 발생했습니다.";
