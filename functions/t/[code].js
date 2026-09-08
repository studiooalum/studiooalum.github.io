import { createRepairTicketAccessToken } from "../../cloudflare/lib/repair-ticket-tokens.js";

function cleanText(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function onRequestGet(context) {
  try {
    const shortCode = cleanText(context.params?.code, 32);
    if (!/^[A-Za-z0-9_-]{10,24}$/.test(shortCode) || !context.env?.OALUM_DB) {
      return new Response("Repair Ticket을 찾을 수 없습니다.", { status: 404 });
    }

    const ticket = await context.env.OALUM_DB.prepare(`
      SELECT id FROM repair_tickets WHERE short_code = ? LIMIT 1
    `).bind(shortCode).first();
    if (!ticket?.id) {
      return new Response("Repair Ticket을 찾을 수 없습니다.", { status: 404 });
    }

    const access = await createRepairTicketAccessToken(context.env, ticket.id);
    const origin = new URL(context.request.url).origin;
    const target = `${origin}/repair-ticket.html?ticket=${encodeURIComponent(ticket.id)}&access=${encodeURIComponent(access)}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Failed to open Repair Ticket short link.", error);
    return new Response("Repair Ticket을 찾을 수 없습니다.", { status: 404 });
  }
}
