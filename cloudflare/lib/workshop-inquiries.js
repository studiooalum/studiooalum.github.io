import { z } from "zod";
import { createNotificationOutboxStatement, prepareNotification, resolveNotificationAdminRecipient } from "./notifications.js";

export const workshopInquirySchema = z.object({
  requestId: z.uuid(),
  fullName: z.string().trim().min(1).max(120),
  email: z.email().trim().max(200).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(8).max(40).regex(/^[+\d\s().-]+$/),
  attendeeCount: z.number().int().min(1).max(1000),
  preferredSchedule: z.string().trim().min(4).max(200),
  locationType: z.enum(["studio", "other"]),
  locationDetail: z.string().trim().max(300).optional().default(""),
  classContent: z.string().trim().min(1).max(1000),
  question: z.string().trim().max(2000).optional().default(""),
  privacyConsent: z.literal(true),
}).refine((input) => input.locationType !== "other" || input.locationDetail.length > 0, {
  path: ["locationDetail"], message: "희망 장소를 입력해주세요.",
});

function requireDb(env) {
  if (!env?.OALUM_DB) throw Object.assign(new Error("문의 접수를 잠시 사용할 수 없습니다."), { status: 503 });
  return env.OALUM_DB;
}

export async function readCustomWorkshopContent(env) {
  const row = await requireDb(env).prepare("SELECT image_url, image_alt FROM workshop_custom_content WHERE id = 'default'").first();
  return { imageUrl: row?.image_url || "", imageAlt: row?.image_alt || "맞춤 워크샵" };
}

export async function saveCustomWorkshopContent(env, { imageUrl, imageAlt = "맞춤 워크샵" }) {
  const safeUrl = /^(?:\.\/|\/(?!\/))/.test(imageUrl) || /^https:\/\//.test(imageUrl);
  if (imageUrl && (!safeUrl || /[<>"\\\u0000-\u0020]/.test(imageUrl))) {
    throw Object.assign(new Error("올바른 대표 이미지 주소를 입력해주세요."), { status: 400 });
  }
  await requireDb(env).prepare(`INSERT INTO workshop_custom_content (id, image_url, image_alt, updated_at)
    VALUES ('default', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET image_url = excluded.image_url, image_alt = excluded.image_alt, updated_at = excluded.updated_at`)
    .bind(imageUrl, imageAlt, new Date().toISOString()).run();
  return readCustomWorkshopContent(env);
}

export async function createWorkshopInquiry(env, rawInput) {
  const parsed = workshopInquirySchema.safeParse(rawInput);
  if (!parsed.success) throw Object.assign(new Error("문의 내용을 다시 확인해주세요."), { status: 400 });
  const input = parsed.data;
  const database = requireDb(env);
  const existing = await database.prepare("SELECT id FROM workshop_inquiries WHERE request_id = ?").bind(input.requestId).first();
  if (existing) return { inquiryId: existing.id };
  const inquiryId = `WIN_${input.requestId.replace(/-/g, "").toUpperCase()}`;
  const now = new Date().toISOString();
  const payload = {
    customer_name: input.fullName, customer_email: input.email, customer_phone: input.phone,
    attendee_count: input.attendeeCount, schedule_label: input.preferredSchedule,
    inquiry_details: `장소: ${input.locationType === "studio" ? "오알룸 작업실" : input.locationDetail}\n수업 내용: ${input.classContent}\n문의사항: ${input.question}`,
    workshop_url: new URL("/workshop-admin#inquiries", env.PUBLIC_SITE_URL || "https://studiooalum.com").href,
  };
  const notifications = await Promise.all([
    prepareNotification(env, { templateKey: "workshop.inquiry_received", recipient: input.email, channel: "email", eventKey: `${inquiryId}:received:customer`, entityType: "workshop_inquiry", entityId: inquiryId, payload }),
    prepareNotification(env, { templateKey: "workshop.inquiry_received_admin", recipient: resolveNotificationAdminRecipient(env), channel: "email", eventKey: `${inquiryId}:received:admin`, entityType: "workshop_inquiry", entityId: inquiryId, payload }),
  ]);
  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO workshop_inquiries (id, request_id, full_name, email, phone, attendee_count,
      preferred_schedule, location_type, location_detail, class_content, question, privacy_consent_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(inquiryId, input.requestId, input.fullName, input.email, input.phone, input.attendeeCount, input.preferredSchedule,
        input.locationType, input.locationDetail, input.classContent, input.question, now, now, now),
    ...notifications.filter(Boolean).map((notification) => createNotificationOutboxStatement(database, notification, { ignoreDuplicate: true })),
  ]);
  return { inquiryId };
}

export async function readWorkshopInquiries(env) {
  const result = await requireDb(env).prepare("SELECT * FROM workshop_inquiries ORDER BY created_at DESC LIMIT 200").all();
  return result.results || [];
}

export async function updateWorkshopInquiry(env, { inquiryId, status, adminNote = "" }) {
  if (!["received", "contacted", "closed"].includes(status)) throw Object.assign(new Error("올바른 문의 상태를 선택해주세요."), { status: 400 });
  const result = await requireDb(env).prepare("UPDATE workshop_inquiries SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?")
    .bind(status, adminNote.slice(0, 2000), new Date().toISOString(), inquiryId).run();
  if (!Number(result?.meta?.changes)) throw Object.assign(new Error("문의를 찾을 수 없습니다."), { status: 404 });
}