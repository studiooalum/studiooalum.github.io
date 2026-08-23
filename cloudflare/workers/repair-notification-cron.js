async function processRepairNotifications(env) {
  const processUrl = String(env.REPAIR_PROCESS_URL || "").trim();
  const cronSecret = String(env.REPAIR_NOTIFICATION_CRON_SECRET || "").trim();
  if (!processUrl || !cronSecret) {
    throw new Error("Repair notification processor URL or secret is missing.");
  }

  const response = await fetch(processUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Repair notification processor returned ${response.status}.`);
  }
  console.log(JSON.stringify({
    event: "repair_notification_cron",
    processing: payload.processing || {},
  }));
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(processRepairNotifications(env));
  },
};