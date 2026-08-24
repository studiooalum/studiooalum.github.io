import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";
import {
  activateNotificationDraft,
  createManualNotificationRetry,
  createNotificationTest,
  previewNotificationTemplate,
  processNotificationOutbox,
  readNotificationAdminSnapshot,
  restoreNotificationDefault,
  saveNotificationDraft,
  setNotificationTemplateEnabled,
} from "../../../cloudflare/lib/notifications.js";

const templateIdentity = {
  templateKey: z.string().trim().min(1).max(120),
  channel: z.enum(["email", "sms"]),
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveDraft"), ...templateIdentity, subject: z.string().max(500), body: z.string().max(6000) }),
  z.object({ action: z.literal("preview"), ...templateIdentity, subject: z.string().max(500), body: z.string().max(6000) }),
  z.object({ action: z.literal("testSend"), ...templateIdentity, subject: z.string().max(500), body: z.string().max(6000) }),
  z.object({ action: z.literal("activate"), ...templateIdentity }),
  z.object({ action: z.literal("restoreDefault"), ...templateIdentity }),
  z.object({ action: z.literal("setEnabled"), ...templateIdentity, enabled: z.boolean() }),
  z.object({ action: z.literal("retry"), outboxId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("process"), limit: z.number().int().min(1).max(50).optional() }),
]);

function actorId(admin) {
  return admin.issuedAt || admin.method || "admin";
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);
    if (typeof context.waitUntil === "function") {
      context.waitUntil(processNotificationOutbox(context.env, { limit: 20 }).catch((error) => {
        console.error("Failed to process notification outbox.", error);
      }));
    }
    return json(context.env, { ok: true, ...(await readNotificationAdminSnapshot(context.env)) });
  } catch (error) {
    return errorResponse(context.env, error, "알림 관리 데이터를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    const admin = await requireAdminAccess(context);
    const parsed = actionSchema.safeParse(await readJson(context.request));
    if (!parsed.success) return validationError(context.env, parsed.error);
    const input = parsed.data;
    const actor = actorId(admin);

    if (input.action === "preview") {
      return json(context.env, { ok: true, preview: await previewNotificationTemplate(context.env, input) });
    }
    if (input.action === "saveDraft") {
      return json(context.env, { ok: true, message: "초안을 저장했습니다.", ...(await saveNotificationDraft(context.env, input, actor)) });
    }
    if (input.action === "activate") {
      return json(context.env, { ok: true, message: "초안을 활성 템플릿으로 적용했습니다.", ...(await activateNotificationDraft(context.env, input, actor)) });
    }
    if (input.action === "restoreDefault") {
      return json(context.env, { ok: true, message: "기본 템플릿을 초안으로 복원했습니다.", ...(await restoreNotificationDefault(context.env, input, actor)) });
    }
    if (input.action === "setEnabled") {
      return json(context.env, { ok: true, message: input.enabled ? "알림을 활성화했습니다." : "알림을 비활성화했습니다.", ...(await setNotificationTemplateEnabled(context.env, input, actor)) });
    }
    if (input.action === "retry") {
      const notification = await createManualNotificationRetry(context.env, input.outboxId, actor);
      const processing = await processNotificationOutbox(context.env, { ids: [notification.id] });
      return json(context.env, { ok: true, message: "재시도 기록을 생성했습니다.", processing, ...(await readNotificationAdminSnapshot(context.env)) });
    }
    if (input.action === "process") {
      const processing = await processNotificationOutbox(context.env, { limit: input.limit || 25 });
      return json(context.env, { ok: true, processing, ...(await readNotificationAdminSnapshot(context.env)) });
    }

    const notification = await createNotificationTest(context.env, input, actor);
    const processing = await processNotificationOutbox(context.env, { ids: [notification.id] });
    return json(context.env, {
      ok: true,
      message: input.channel === "sms" ? "문자 테스트를 처리했습니다. dry-run 설정을 확인해주세요." : "테스트 이메일을 처리했습니다.",
      processing,
      ...(await readNotificationAdminSnapshot(context.env)),
    });
  } catch (error) {
    return errorResponse(context.env, error, "알림 관리 요청을 처리하지 못했습니다.");
  }
}