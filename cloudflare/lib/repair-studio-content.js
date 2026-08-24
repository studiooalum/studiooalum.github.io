function requireDb(env) {
  const database = env?.OALUM_DB;
  if (!database) throw Object.assign(new Error("D1 바인딩이 준비되지 않았습니다."), { status: 503 });
  return database;
}

function cleanText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function decodeParagraphs(value) {
  try {
    const paragraphs = JSON.parse(value || "[]");
    return Array.isArray(paragraphs) ? paragraphs.map((paragraph) => cleanText(paragraph, 4000)).filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function formatContent(row) {
  return {
    title: row?.title || "Repair Studio",
    lead: row?.lead || "",
    paragraphs: decodeParagraphs(row?.body_json),
    ctaLabel: row?.cta_label || "수선 신청하기",
    isPublished: Boolean(row?.is_published),
    updatedAt: row?.updated_at || "",
  };
}

export async function readRepairStudioContent(env, { includeDraft = false } = {}) {
  const database = requireDb(env);
  const row = await database.prepare(`
    SELECT * FROM repair_studio_content
    WHERE id = 'default' ${includeDraft ? "" : "AND is_published = 1"}
    LIMIT 1
  `).first();
  return row ? formatContent(row) : null;
}

export async function updateRepairStudioContent(env, input) {
  const database = requireDb(env);
  const title = cleanText(input.title, 120);
  const lead = cleanText(input.lead, 500);
  const paragraphs = (Array.isArray(input.paragraphs) ? input.paragraphs : [])
    .map((paragraph) => cleanText(paragraph, 4000))
    .filter(Boolean)
    .slice(0, 12);
  const ctaLabel = cleanText(input.ctaLabel, 80);
  if (!title || !lead || !paragraphs.length || !ctaLabel) {
    throw Object.assign(new Error("제목, 소개, 본문, 버튼 문구를 모두 입력해주세요."), { status: 400 });
  }
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO repair_studio_content (
      id, title, lead, body_json, cta_label, is_published, created_at, updated_at
    ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      lead = excluded.lead,
      body_json = excluded.body_json,
      cta_label = excluded.cta_label,
      is_published = excluded.is_published,
      updated_at = excluded.updated_at
  `).bind(title, lead, JSON.stringify(paragraphs), ctaLabel, input.isPublished ? 1 : 0, now, now).run();
  return readRepairStudioContent(env, { includeDraft: true });
}