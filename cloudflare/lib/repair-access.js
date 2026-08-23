import { readSession } from "./auth.js";
import { verifyGuestLookupToken } from "./guest-lookup.js";
import { readRepairRequestForCustomer, readRepairRequestForEmail, readRepairRequestsForEmail } from "./repairs.js";

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getGuestToken(request) {
  return cleanText(request.headers.get("X-Guest-Access-Token"), 500);
}

export async function authorizeRepairCustomerAccess(context, requestId = "") {
  const normalizedRequestId = cleanText(requestId, 80);
  const guestToken = getGuestToken(context.request);
  if (guestToken) {
    const access = await verifyGuestLookupToken(context.env, guestToken, {
      resourceType: "repair",
      ...(normalizedRequestId ? { resourceId: normalizedRequestId } : {}),
    });
    return {
      actor: { type: "guest", id: access.reference },
      request: await readRepairRequestForCustomer(context.env, access.resourceId),
      accessToken: guestToken,
    };
  }

  const session = await readSession(context.env, context.request, { touch: false });
  if (!session?.user?.email) {
    throw Object.assign(new Error("수선 내역 조회 권한이 필요합니다."), { status: 401 });
  }
  const repairRequest = normalizedRequestId
    ? await readRepairRequestForEmail(context.env, normalizedRequestId, session.user.email)
    : (await readRepairRequestsForEmail(context.env, session.user.email, 1))[0];
  if (!repairRequest) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }
  return {
    actor: { type: "member", id: session.user.id },
    request: repairRequest,
    accessToken: "",
  };
}