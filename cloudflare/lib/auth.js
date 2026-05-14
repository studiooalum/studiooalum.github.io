const SESSION_COOKIE_NAME = "oalum_session";
const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_RESEND_WINDOW_MS = 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HASH_ITERATIONS = 310000;

import { linkGuestWorkshopReservationsToUser, readWorkshopReservationsForIdentity } from "./workshops.js";

function getDb(env) {
  return env?.OALUM_DB || null;
}

function requireDb(env) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("D1 binding is required for auth."), {
      status: 503,
    });
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function addMs(timestamp, ms) {
  return new Date(new Date(timestamp).getTime() + ms).toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function createId(prefix) {
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${randomHex(6)}`.toUpperCase();
}

function randomHex(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateLoginCode() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function shouldUseSecureCookie(request, env) {
  if (String(env?.AUTH_COOKIE_INSECURE || "").trim().toLowerCase() === "true") {
    return false;
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

function withPepper(env, value) {
  const pepper = String(env?.AUTH_SECRET || "").trim();
  return pepper ? `${pepper}:${value}` : value;
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashLoginCode(env, email, code) {
  return sha256Hex(withPepper(env, `${normalizeEmail(email)}:${String(code || "").trim()}`));
}

function normalizeDirectAuthMode(value) {
  const mode = String(value || "login").trim().toLowerCase();
  return mode === "signup" ? "signup" : "login";
}

async function hashDirectLoginCode(env, email, code, mode = "login") {
  const normalizedMode = normalizeDirectAuthMode(mode);
  return sha256Hex(withPepper(env, `${normalizeEmail(email)}:${normalizedMode}:${String(code || "").trim()}`));
}

async function hashSessionToken(env, token) {
  return sha256Hex(withPepper(env, String(token || "")));
}

function hexToBytes(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return new Uint8Array();
  }

  const byteLength = Math.floor(normalized.length / 2);
  const bytes = new Uint8Array(byteLength);

  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function normalizeBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === 1 || value === 0) {
    return Boolean(value);
  }

  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasPasswordCredentials(row) {
  return Boolean(String(row?.password_hash || "").trim() && String(row?.password_salt || "").trim());
}

async function derivePasswordHash(env, password, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(withPepper(env, String(password || ""))),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createPasswordCredentials(env, password) {
  const passwordSalt = randomHex(16);
  const passwordHash = await derivePasswordHash(env, password, passwordSalt);

  return {
    passwordSalt,
    passwordHash,
  };
}

async function verifyPasswordCredentials(env, password, row) {
  if (!hasPasswordCredentials(row)) {
    return false;
  }

  const candidateHash = await derivePasswordHash(env, password, row.password_salt);
  return candidateHash === String(row.password_hash || "");
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.user_id || row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    fullName: row.full_name || "",
    phone: row.phone || "",
    zipcode: row.zipcode || "",
    address1: row.address1 || "",
    address2: row.address2 || "",
    marketingOptIn: normalizeBoolean(row.marketing_opt_in),
    pointsBalance: Number(row.points_balance) || 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastLoginAt: row.last_login_at || null,
  };
}

async function findIdentityRecord(database, { provider, providerUserId }) {
  return (await database
    .prepare(`
      SELECT *
      FROM auth_identities
      WHERE provider = ?
        AND provider_user_id = ?
      LIMIT 1
    `)
    .bind(String(provider || "").trim().toLowerCase(), String(providerUserId || "").trim())
    .first()) || null;
}

async function upsertIdentity(database, {
  userId,
  provider,
  providerUserId,
  providerEmail,
}) {
  const providerNormalized = String(provider || "").trim().toLowerCase();
  const providerEmailNormalized = normalizeEmail(providerEmail);
  const now = nowIso();

  await database
    .prepare(`
      INSERT INTO auth_identities (
        user_id,
        provider,
        provider_user_id,
        provider_email,
        provider_email_normalized,
        created_at,
        updated_at,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        user_id = excluded.user_id,
        provider_email = excluded.provider_email,
        provider_email_normalized = excluded.provider_email_normalized,
        updated_at = excluded.updated_at,
        last_used_at = excluded.last_used_at
    `)
    .bind(
      userId,
      providerNormalized,
      String(providerUserId || "").trim(),
      providerEmailNormalized,
      providerEmailNormalized,
      now,
      now,
      now,
    )
    .run();
}

async function readIdentityProviders(database, userId) {
  const result = await database
    .prepare(`
      SELECT provider
      FROM auth_identities
      WHERE user_id = ?
      ORDER BY provider ASC
    `)
    .bind(userId)
    .all();

  return Array.from(new Set((result?.results || []).map((row) => String(row.provider || "").trim()).filter(Boolean)));
}

async function findUserByEmail(database, emailNormalized) {
  return (await database
    .prepare(`SELECT * FROM users WHERE email_normalized = ? LIMIT 1`)
    .bind(emailNormalized)
    .first()) || null;
}

async function findUserById(database, userId) {
  return (await database
    .prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first()) || null;
}

async function touchUserLogin(database, userId, profile = {}) {
  const existing = await findUserById(database, userId);
  if (!existing) {
    return null;
  }

  const now = nowIso();
  const nextFullName = existing.full_name || cleanText(profile.fullName, 120) || "";

  await database
    .prepare(`
      UPDATE users
      SET full_name = ?,
          updated_at = ?,
          last_login_at = ?
      WHERE id = ?
    `)
    .bind(nextFullName, now, now, existing.id)
    .run();

  return mapUser({
    ...existing,
    full_name: nextFullName,
    updated_at: now,
    last_login_at: now,
  });
}

async function ensureUser(database, email, profile = {}) {
  const emailNormalized = normalizeEmail(email);
  const existing = await findUserByEmail(database, emailNormalized);
  const now = nowIso();
  const fullName = cleanText(profile.fullName, 120);

  if (existing) {
    const nextFullName = existing.full_name || fullName || "";

    await database
      .prepare(`
        UPDATE users
        SET email = ?,
            full_name = ?,
            updated_at = ?,
            last_login_at = ?
        WHERE id = ?
      `)
      .bind(emailNormalized, nextFullName, now, now, existing.id)
      .run();

    return mapUser({
      ...existing,
      email: emailNormalized,
      full_name: nextFullName,
      updated_at: now,
      last_login_at: now,
    });
  }

  const id = createId("USR");
  await database
    .prepare(`
      INSERT INTO users (
        id,
        email,
        email_normalized,
        full_name,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, emailNormalized, emailNormalized, fullName, now, now, now)
    .run();

  return mapUser({
    id,
    email: emailNormalized,
    email_normalized: emailNormalized,
    full_name: fullName,
    phone: "",
    zipcode: "",
    address1: "",
    address2: "",
    password_hash: "",
    password_salt: "",
    marketing_opt_in: 0,
    points_balance: 0,
    created_at: now,
    updated_at: now,
    last_login_at: now,
  });
}

async function createOrUpdatePasswordUser(database, env, {
  email,
  fullName,
  password,
  marketingOptIn = false,
}) {
  const emailNormalized = normalizeEmail(email);
  const existing = await findUserByEmail(database, emailNormalized);
  const now = nowIso();
  const nextFullName = cleanText(fullName, 120);
  const { passwordHash, passwordSalt } = await createPasswordCredentials(env, password);
  const marketingEnabled = marketingOptIn ? 1 : 0;
  const marketingAcceptedAt = marketingOptIn ? now : null;

  if (existing && hasPasswordCredentials(existing)) {
    throw Object.assign(new Error("이미 가입된 계정입니다. 로그인해 주세요."), {
      status: 409,
    });
  }

  if (existing) {
    await database
      .prepare(`
        UPDATE users
        SET email = ?,
            full_name = ?,
            password_hash = ?,
            password_salt = ?,
            privacy_policy_accepted_at = COALESCE(privacy_policy_accepted_at, ?),
            terms_accepted_at = COALESCE(terms_accepted_at, ?),
            marketing_opt_in = ?,
            marketing_opt_in_at = ?,
            updated_at = ?,
            last_login_at = ?
        WHERE id = ?
      `)
      .bind(
        emailNormalized,
        nextFullName || existing.full_name || "",
        passwordHash,
        passwordSalt,
        now,
        now,
        marketingEnabled,
        marketingAcceptedAt,
        now,
        now,
        existing.id,
      )
      .run();

    return mapUser({
      ...existing,
      email: emailNormalized,
      email_normalized: emailNormalized,
      full_name: nextFullName || existing.full_name || "",
      password_hash: passwordHash,
      password_salt: passwordSalt,
      marketing_opt_in: marketingEnabled,
      updated_at: now,
      last_login_at: now,
    });
  }

  const userId = createId("USR");
  await database
    .prepare(`
      INSERT INTO users (
        id,
        email,
        email_normalized,
        full_name,
        phone,
        zipcode,
        address1,
        address2,
        password_hash,
        password_salt,
        privacy_policy_accepted_at,
        terms_accepted_at,
        marketing_opt_in,
        marketing_opt_in_at,
        points_balance,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, '', '', '', '', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `)
    .bind(
      userId,
      emailNormalized,
      emailNormalized,
      nextFullName,
      passwordHash,
      passwordSalt,
      now,
      now,
      marketingEnabled,
      marketingAcceptedAt,
      now,
      now,
      now,
    )
    .run();

  return mapUser({
    id: userId,
    email: emailNormalized,
    email_normalized: emailNormalized,
    full_name: nextFullName,
    phone: "",
    zipcode: "",
    address1: "",
    address2: "",
    password_hash: passwordHash,
    password_salt: passwordSalt,
    marketing_opt_in: marketingEnabled,
    points_balance: 0,
    created_at: now,
    updated_at: now,
    last_login_at: now,
  });
}

async function sendLoginCode(env, { email, code }) {
  const debugMode = String(env?.AUTH_DEBUG || "").trim().toLowerCase() === "true";
  const resendApiKey = String(env?.RESEND_API_KEY || "").trim();

  if (!resendApiKey) {
    if (debugMode) {
      return {
        provider: "debug",
        debugCode: code,
      };
    }

    throw Object.assign(new Error("Email delivery is not configured. Set RESEND_API_KEY or enable AUTH_DEBUG for development."), {
      status: 503,
    });
  }

  const from = String(env?.RESEND_FROM_EMAIL || "").trim();
  if (!from) {
    throw Object.assign(new Error("RESEND_FROM_EMAIL is required when RESEND_API_KEY is configured."), {
      status: 503,
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Studio OALUM 로그인 인증코드",
      html: `
        <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
          <p>Studio OALUM 로그인 인증코드입니다.</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em; margin: 20px 0;">${code}</p>
          <p>이 코드는 10분 동안 유효합니다.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw Object.assign(new Error("Failed to send login email."), {
      status: 502,
      details: {
        provider: "resend",
        status: response.status,
        body: details,
      },
    });
  }

  return {
    provider: "resend",
    debugCode: debugMode ? code : null,
  };
}

function formatOrder(row) {
  return {
    orderId: row.id,
    userId: row.user_id || null,
    orderName: row.order_name,
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: Number(row.total_amount) || 0,
    currency: row.currency || "KRW",
    createdAt: row.created_at,
  };
}

async function linkGuestOrdersToUser(database, userId, emailNormalized) {
  if (!userId || !emailNormalized) {
    return false;
  }

  await database
    .prepare(`
      UPDATE orders
      SET user_id = COALESCE(user_id, ?),
          updated_at = ?
      WHERE user_id IS NULL
        AND lower(customer_email) = ?
    `)
    .bind(userId, nowIso(), emailNormalized)
    .run();

  return true;
}

async function readOrdersForUser(database, { userId, emailNormalized }, limit = 20) {
  const result = await database
    .prepare(`
      SELECT
        id,
        user_id,
        order_name,
        status,
        payment_status,
        total_amount,
        currency,
        customer_name,
        customer_phone,
        zipcode,
        address1,
        address2,
        created_at
      FROM orders
      WHERE user_id = ?
         OR lower(customer_email) = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(userId || null, emailNormalized, limit)
    .all();

  return (result?.results || []).map(formatOrder);
}

async function readLatestOrderProfile(database, { userId, emailNormalized }) {
  return (await database
    .prepare(`
      SELECT
        customer_name,
        customer_phone,
        zipcode,
        address1,
        address2
      FROM orders
      WHERE user_id = ?
         OR lower(customer_email) = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(userId || null, emailNormalized)
    .first()) || null;
}

export async function requestLoginCode(env, email) {
  const database = requireDb(env);
  const options = typeof email === "string"
    ? { email, mode: "login", fullName: "" }
    : { ...(email || {}) };
  const emailNormalized = normalizeEmail(options.email);
  const authMode = normalizeDirectAuthMode(options.mode);
  const existingUser = await findUserByEmail(database, emailNormalized);

  if (authMode === "login" && !existingUser) {
    throw Object.assign(new Error("가입된 계정이 없습니다. 회원가입을 먼저 진행해주세요."), {
      status: 404,
    });
  }

  if (authMode === "signup" && existingUser) {
    throw Object.assign(new Error("이미 가입된 계정입니다. 로그인해 주세요."), {
      status: 409,
    });
  }

  const recent = await database
    .prepare(`
      SELECT id, created_at, consumed_at
      FROM auth_login_codes
      WHERE email_normalized = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .bind(emailNormalized)
    .first();

  if (recent?.consumed_at == null && recent?.created_at) {
    const elapsed = Date.now() - Date.parse(recent.created_at);
    if (Number.isFinite(elapsed) && elapsed < LOGIN_RESEND_WINDOW_MS) {
      throw Object.assign(new Error("Please wait a moment before requesting another login code."), {
        status: 429,
      });
    }
  }

  const createdAt = nowIso();
  const expiresAt = addMs(createdAt, LOGIN_CODE_TTL_MS);
  const code = generateLoginCode();
  const codeHash = await hashDirectLoginCode(env, emailNormalized, code, authMode);

  const insertResult = await database
    .prepare(`
      INSERT INTO auth_login_codes (
        email_normalized,
        code_hash,
        attempts,
        expires_at,
        consumed_at,
        created_at
      ) VALUES (?, ?, 0, ?, NULL, ?)
    `)
    .bind(emailNormalized, codeHash, expiresAt, createdAt)
    .run();

  let delivery;

  try {
    delivery = await sendLoginCode(env, {
      email: emailNormalized,
      code,
    });
  } catch (error) {
    const codeId = insertResult?.meta?.last_row_id;

    if (codeId) {
      await database
        .prepare(`DELETE FROM auth_login_codes WHERE id = ?`)
        .bind(codeId)
        .run()
        .catch(() => {});
    }

    throw error;
  }

  return {
    delivery: delivery.provider,
    expiresInSeconds: Math.floor(LOGIN_CODE_TTL_MS / 1000),
    debugCode: delivery.debugCode || null,
  };
}

async function markCodeAttempt(database, codeId, attempts, consumedAt = null) {
  await database
    .prepare(`
      UPDATE auth_login_codes
      SET attempts = ?,
          consumed_at = COALESCE(?, consumed_at)
      WHERE id = ?
    `)
    .bind(attempts, consumedAt, codeId)
    .run();
}

async function createSession(database, env, userId, request) {
  const token = randomHex(32);
  const now = nowIso();
  const expiresAt = addMs(now, SESSION_TTL_MS);
  const sessionId = createId("SES");
  const tokenHash = await hashSessionToken(env, token);
  const userAgent = cleanText(request.headers.get("user-agent"), 512);
  const ipAddress = cleanText(
    request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for"),
    128,
  );

  await database
    .prepare(`
      INSERT INTO auth_sessions (
        id,
        user_id,
        session_token_hash,
        expires_at,
        created_at,
        last_seen_at,
        user_agent,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(sessionId, userId, tokenHash, expiresAt, now, now, userAgent, ipAddress)
    .run();

  return {
    token,
    expiresAt,
  };
}

export async function verifyLoginCode(env, { email, code, fullName, mode }, request) {
  const database = requireDb(env);
  const emailNormalized = normalizeEmail(email);
  const authMode = normalizeDirectAuthMode(mode);
  const recordsResult = await database
    .prepare(`
      SELECT *
      FROM auth_login_codes
      WHERE email_normalized = ?
        AND consumed_at IS NULL
      ORDER BY id DESC
      LIMIT 6
    `)
    .bind(emailNormalized)
    .all();

  const records = recordsResult?.results || [];
  const record = records[0] || null;

  if (records.length === 0) {
    throw Object.assign(new Error("No active login code was found for this email address."), {
      status: 400,
    });
  }

  const candidateHash = await hashDirectLoginCode(env, emailNormalized, code, authMode);
  const matchingRecord = records.find((item) => item.code_hash === candidateHash) || null;

  if (!matchingRecord) {
    const nextAttempts = (Number(record?.attempts) || 0) + 1;
    if (record) {
      await markCodeAttempt(
        database,
        record.id,
        nextAttempts,
        nextAttempts >= MAX_LOGIN_ATTEMPTS ? nowIso() : null,
      );
    }

    throw Object.assign(new Error("The login code is incorrect."), {
      status: 400,
    });
  }

  if (!matchingRecord.expires_at || Date.parse(matchingRecord.expires_at) <= Date.now()) {
    await markCodeAttempt(database, matchingRecord.id, Number(matchingRecord.attempts) || 0, nowIso());
    throw Object.assign(new Error("This login code has expired. Please request a new one."), {
      status: 400,
    });
  }

  const nextAttempts = (Number(matchingRecord.attempts) || 0) + 1;
  if (nextAttempts > MAX_LOGIN_ATTEMPTS) {
    await markCodeAttempt(database, matchingRecord.id, nextAttempts, nowIso());
    throw Object.assign(new Error("Too many failed attempts. Please request a new login code."), {
      status: 429,
    });
  }

  await markCodeAttempt(database, matchingRecord.id, nextAttempts, nowIso());

  let user = null;
  const existingUser = await findUserByEmail(database, emailNormalized);

  if (authMode === "signup") {
    if (existingUser) {
      throw Object.assign(new Error("이미 가입된 계정입니다. 로그인해 주세요."), {
        status: 409,
      });
    }

    user = await ensureUser(database, emailNormalized, { fullName });
  } else {
    if (!existingUser) {
      throw Object.assign(new Error("가입된 계정이 없습니다. 회원가입을 먼저 진행해주세요."), {
        status: 404,
      });
    }

    user = await touchUserLogin(database, existingUser.id, { fullName: existingUser.full_name || fullName });
  }

  await linkGuestOrdersToUser(database, user.id, user.emailNormalized);
  await linkGuestWorkshopReservationsToUser(database, user.id, user.emailNormalized);
  await upsertIdentity(database, {
    userId: user.id,
    provider: "direct",
    providerUserId: user.emailNormalized,
    providerEmail: user.email,
  });
  const session = await createSession(database, env, user.id, request);

  return {
    user,
    session,
  };
}

export async function loginWithPassword(env, { email, password }, request) {
  const database = requireDb(env);
  const emailNormalized = normalizeEmail(email);
  const existingUser = await findUserByEmail(database, emailNormalized);

  if (!existingUser) {
    throw Object.assign(new Error("이메일 또는 비밀번호가 올바르지 않습니다."), {
      status: 401,
    });
  }

  if (!hasPasswordCredentials(existingUser)) {
    throw Object.assign(new Error("비밀번호가 아직 설정되지 않았습니다. 회원가입 페이지에서 비밀번호를 먼저 설정해주세요."), {
      status: 400,
    });
  }

  const isValidPassword = await verifyPasswordCredentials(env, password, existingUser);
  if (!isValidPassword) {
    throw Object.assign(new Error("이메일 또는 비밀번호가 올바르지 않습니다."), {
      status: 401,
    });
  }

  const user = await touchUserLogin(database, existingUser.id, {
    fullName: existingUser.full_name,
  });

  await linkGuestOrdersToUser(database, user.id, user.emailNormalized);
  await linkGuestWorkshopReservationsToUser(database, user.id, user.emailNormalized);
  await upsertIdentity(database, {
    userId: user.id,
    provider: "direct",
    providerUserId: user.emailNormalized,
    providerEmail: user.email,
  });
  const session = await createSession(database, env, user.id, request);

  return {
    user,
    session,
  };
}

export async function signupWithPassword(env, {
  email,
  fullName,
  password,
  privacyConsent,
  termsConsent,
  marketingConsent,
}, request) {
  if (String(password || "").length < PASSWORD_MIN_LENGTH) {
    throw Object.assign(new Error(`비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`), {
      status: 400,
    });
  }

  if (!privacyConsent || !termsConsent) {
    throw Object.assign(new Error("필수 약관 동의가 필요합니다."), {
      status: 400,
    });
  }

  const database = requireDb(env);
  const user = await createOrUpdatePasswordUser(database, env, {
    email,
    fullName,
    password,
    marketingOptIn: marketingConsent,
  });

  await linkGuestOrdersToUser(database, user.id, user.emailNormalized);
  await linkGuestWorkshopReservationsToUser(database, user.id, user.emailNormalized);
  await upsertIdentity(database, {
    userId: user.id,
    provider: "direct",
    providerUserId: user.emailNormalized,
    providerEmail: user.email,
  });
  const session = await createSession(database, env, user.id, request);

  return {
    user,
    session,
  };
}

export function createSessionCookie(request, env, token) {
  const secure = shouldUseSecureCookie(request, env);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie(request, env) {
  const secure = shouldUseSecureCookie(request, env);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export async function readSession(env, request, { touch = true } = {}) {
  const database = getDb(env);
  if (!database) return null;

  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  const tokenHash = await hashSessionToken(env, sessionToken);
  const row = await database
    .prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        s.last_seen_at AS session_last_seen_at,
        u.id AS user_id,
        u.email,
        u.email_normalized,
        u.full_name,
        u.phone,
        u.zipcode,
        u.address1,
        u.address2,
        u.points_balance,
        u.created_at,
        u.updated_at,
        u.last_login_at
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
      LIMIT 1
    `)
    .bind(tokenHash)
    .first();

  if (!row) {
    return null;
  }

  if (!row.session_expires_at || Date.parse(row.session_expires_at) <= Date.now()) {
    await database
      .prepare(`DELETE FROM auth_sessions WHERE id = ?`)
      .bind(row.session_id)
      .run();
    return null;
  }

  if (touch) {
    const lastSeenAt = Date.parse(row.session_last_seen_at || "");
    if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt >= 15 * 60 * 1000) {
      await database
        .prepare(`UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?`)
        .bind(nowIso(), row.session_id)
        .run();
    }
  }

  return {
    sessionId: row.session_id,
    expiresAt: row.session_expires_at,
    user: mapUser(row),
  };
}

export async function requireSession(env, request) {
  const session = await readSession(env, request);
  if (!session) {
    throw Object.assign(new Error("Authentication is required."), {
      status: 401,
    });
  }

  return session;
}

export async function clearSession(env, request) {
  const database = getDb(env);
  if (!database) return false;

  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return false;
  }

  const tokenHash = await hashSessionToken(env, sessionToken);
  await database
    .prepare(`DELETE FROM auth_sessions WHERE session_token_hash = ?`)
    .bind(tokenHash)
    .run();

  return true;
}

export async function authenticateFederatedIdentity(env, identity, request) {
  const database = requireDb(env);
  const provider = String(identity?.provider || "").trim().toLowerCase();
  const providerUserId = String(identity?.providerUserId || "").trim();
  const emailNormalized = normalizeEmail(identity?.email);
  const fullName = cleanText(identity?.fullName, 120);

  if (!provider || !providerUserId) {
    throw Object.assign(new Error("Provider identity is incomplete."), {
      status: 400,
    });
  }

  let user = null;
  const existingIdentity = await findIdentityRecord(database, {
    provider,
    providerUserId,
  });

  if (existingIdentity?.user_id) {
    user = await touchUserLogin(database, existingIdentity.user_id, { fullName });
  }

  if (!user) {
    if (!emailNormalized) {
      throw Object.assign(new Error("Provider account email is required."), {
        status: 400,
      });
    }

    user = await ensureUser(database, emailNormalized, { fullName });
  }

  await upsertIdentity(database, {
    userId: user.id,
    provider,
    providerUserId,
    providerEmail: user.email || emailNormalized,
  });

  await linkGuestOrdersToUser(database, user.id, user.emailNormalized);
  await linkGuestWorkshopReservationsToUser(database, user.id, user.emailNormalized);
  const session = await createSession(database, env, user.id, request);

  return {
    user,
    session: {
      ...session,
      cookie: createSessionCookie(request, env, session.token),
    },
  };
}

export async function readAccount(env, userId) {
  const database = requireDb(env);
  const userRow = await findUserById(database, userId);
  if (!userRow) {
    throw Object.assign(new Error("User account could not be found."), {
      status: 404,
    });
  }

  const user = mapUser(userRow);
  await linkGuestOrdersToUser(database, user.id, user.emailNormalized);
  await linkGuestWorkshopReservationsToUser(database, user.id, user.emailNormalized);
  const linkedProviders = await readIdentityProviders(database, user.id);
  const latestOrderProfile = await readLatestOrderProfile(database, {
    userId: user.id,
    emailNormalized: user.emailNormalized,
  });
  const orders = await readOrdersForUser(database, {
    userId: user.id,
    emailNormalized: user.emailNormalized,
  });
  const workshopReservations = await readWorkshopReservationsForIdentity(database, {
    userId: user.id,
    emailNormalized: user.emailNormalized,
  });

  return {
    user: {
      ...user,
      linkedProviders,
      fullName: user.fullName || latestOrderProfile?.customer_name || "",
      phone: user.phone || latestOrderProfile?.customer_phone || "",
      zipcode: user.zipcode || latestOrderProfile?.zipcode || "",
      address1: user.address1 || latestOrderProfile?.address1 || "",
      address2: user.address2 || latestOrderProfile?.address2 || "",
    },
    orders,
    workshopReservations,
  };
}

export async function updateAccount(env, userId, input) {
  const database = requireDb(env);
  const now = nowIso();

  await database
    .prepare(`
      UPDATE users
      SET full_name = ?,
          phone = ?,
          zipcode = ?,
          address1 = ?,
          address2 = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      cleanText(input.fullName, 120),
      cleanText(input.phone, 40),
      cleanText(input.zipcode, 20),
      cleanText(input.address1, 200),
      cleanText(input.address2, 200),
      now,
      userId,
    )
    .run();

  return readAccount(env, userId);
}

function formatGuestOrderItem(row) {
  return {
    title: row.title,
    editionLabel: row.edition_label || "",
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unit_price) || 0,
  };
}

export async function lookupGuestOrder(env, { orderId, email }) {
  const database = requireDb(env);
  const normalizedOrderId = cleanText(orderId, 80);
  const emailNormalized = normalizeEmail(email);

  const order = await database
    .prepare(`
      SELECT
        id,
        order_name,
        status,
        payment_status,
        total_amount,
        currency,
        customer_name,
        customer_phone,
        customer_email,
        zipcode,
        address1,
        address2,
        created_at
      FROM orders
      WHERE id = ?
        AND lower(customer_email) = ?
      LIMIT 1
    `)
    .bind(normalizedOrderId, emailNormalized)
    .first();

  if (!order) {
    throw Object.assign(new Error("주문번호와 이메일이 일치하는 비회원 주문을 찾을 수 없습니다."), {
      status: 404,
    });
  }

  const itemsResult = await database
    .prepare(`
      SELECT title, edition_label, quantity, unit_price
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `)
    .bind(order.id)
    .all();

  return {
    order: {
      orderId: order.id,
      orderName: order.order_name,
      status: order.status,
      paymentStatus: order.payment_status,
      totalAmount: Number(order.total_amount) || 0,
      currency: order.currency || "KRW",
      createdAt: order.created_at,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      zipcode: order.zipcode,
      address1: order.address1,
      address2: order.address2 || "",
      items: (itemsResult?.results || []).map(formatGuestOrderItem),
    },
  };
}