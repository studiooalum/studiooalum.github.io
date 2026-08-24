import { requireAdminAccess } from "./admin.js";
import { readSession } from "./auth.js";
import { verifyGuestLookupToken } from "./guest-lookup.js";
import { readRepairRequestForCustomer, readRepairRequestForEmail, readRepairRequestsForEmail } from "./repairs.js";
import { readRepairTicketById } from "./repair-tickets.js";
import { verifyRepairTicketAccessToken } from "./repair-ticket-tokens.js";

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

export async function authorizeRepairTicketAccess(context, ticketId) {
  const ticketResult = await readRepairTicketById(context.env, cleanText(ticketId, 80));
  const authorization = cleanText(context.request.headers.get("Authorization"), 1000);
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const admin = await requireAdminAccess(context);
    return {
      actor: { type: "admin", id: admin.issuedAt || admin.method },
      viewerType: "admin",
      ...ticketResult,
    };
  }
  const signedToken = cleanText(context.request.headers.get("X-Repair-Ticket-Access"), 4000);
  if (signedToken && await verifyRepairTicketAccessToken(context.env, signedToken, ticketResult.ticket.id)) {
    return {
      actor: { type: "guest", id: ticketResult.ticket.id },
      viewerType: "customer",
      ...ticketResult,
    };
  }
  const customer = await authorizeRepairCustomerAccess(context, ticketResult.ticket.repairId);
  return {
    actor: customer.actor,
    viewerType: "customer",
    ...ticketResult,
  };
}