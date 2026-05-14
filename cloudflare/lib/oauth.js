import { authenticateFederatedIdentity } from "./auth.js";

const OAUTH_STATE_COOKIE_NAME = "oalum_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REDIRECT_PATH = "/account.html";

const PROVIDER_DEFINITIONS = {
  kakao: {
    key: "kakao",
    label: "카카오로 계속하기",
  },
  naver: {
    key: "naver",
    label: "네이버로 계속하기",
  },
  google: {
    key: "google",
    label: "Google로 계속하기",
  },
};

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nowIso() {
  return new Date().toISOString();
}

function addMs(timestamp, ms) {
  return new Date(new Date(timestamp).getTime() + ms).toISOString();
}

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveRedirectPath(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return raw;
}

function getBaseUrl(request, env) {
  const explicit = String(env?.AUTH_BASE_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
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

function createCookie(name, value, request, env, { maxAge = 0 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (shouldUseSecureCookie(request, env)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearCookie(name, request, env) {
  return createCookie(name, "", request, env, { maxAge: 0 });
}

async function hmacHex(env, value) {
  const secret = String(env?.AUTH_SECRET || "").trim();
  if (!secret) {
    throw Object.assign(new Error("AUTH_SECRET is required for OAuth flows."), {
      status: 503,
    });
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const buffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createStateToken(env, payload) {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const signature = await hmacHex(env, encoded);
  return `${encoded}.${signature}`;
}

async function parseStateToken(env, token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = await hmacHex(env, encoded);
  if (expected !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeURIComponent(encoded));
    if (!payload?.expiresAt || Date.parse(payload.expiresAt) <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
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

function appendRedirectParams(url, params) {
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function createRedirectResponse(location, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies.filter(Boolean)) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(null, {
    status: 302,
    headers,
  });
}

function getProviderCredentials(env, provider) {
  switch (provider) {
    case "kakao":
      return {
        clientId: String(env?.KAKAO_CLIENT_ID || "").trim(),
        clientSecret: String(env?.KAKAO_CLIENT_SECRET || "").trim(),
      };
    case "naver":
      return {
        clientId: String(env?.NAVER_CLIENT_ID || "").trim(),
        clientSecret: String(env?.NAVER_CLIENT_SECRET || "").trim(),
      };
    case "google":
      return {
        clientId: String(env?.GOOGLE_CLIENT_ID || "").trim(),
        clientSecret: String(env?.GOOGLE_CLIENT_SECRET || "").trim(),
      };
    default:
      return {
        clientId: "",
        clientSecret: "",
      };
  }
}

function isProviderConfigured(env, provider) {
  const credentials = getProviderCredentials(env, provider);
  if (!credentials.clientId) {
    return false;
  }

  if (provider === "kakao") {
    return true;
  }

  return Boolean(credentials.clientSecret);
}

function getProviderConfig(env, request, provider) {
  const normalized = normalizeProvider(provider);
  const definition = PROVIDER_DEFINITIONS[normalized];
  if (!definition) {
    return null;
  }

  const credentials = getProviderCredentials(env, normalized);
  const baseUrl = getBaseUrl(request, env);

  return {
    ...definition,
    ...credentials,
    enabled: isProviderConfigured(env, normalized),
    redirectUri: `${baseUrl}/api/auth/oauth/callback?provider=${encodeURIComponent(normalized)}`,
  };
}

export function listOAuthProviders(env) {
  return Object.values(PROVIDER_DEFINITIONS)
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      enabled: isProviderConfigured(env, definition.key),
    }));
}

function buildAuthorizeUrl(config, state) {
  const url = (() => {
    switch (config.key) {
      case "kakao":
        return new URL("https://kauth.kakao.com/oauth/authorize");
      case "naver":
        return new URL("https://nid.naver.com/oauth2.0/authorize");
      case "google":
        return new URL("https://accounts.google.com/o/oauth2/v2/auth");
      default:
        throw Object.assign(new Error("Unsupported OAuth provider."), {
          status: 400,
        });
    }
  })();

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);

  switch (config.key) {
    case "kakao":
      url.searchParams.set("scope", "profile_nickname,account_email");
      break;
    case "google":
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("access_type", "online");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("prompt", "select_account");
      break;
    default:
      break;
  }

  return url.toString();
}

async function requestAccessToken(config, code, state) {
  let response;

  switch (config.key) {
    case "kakao": {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code,
      });

      if (config.clientSecret) {
        body.set("client_secret", config.clientSecret);
      }

      response = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body,
      });
      break;
    }
    case "naver": {
      const url = new URL("https://nid.naver.com/oauth2.0/token");
      url.searchParams.set("grant_type", "authorization_code");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("client_secret", config.clientSecret);
      url.searchParams.set("code", code);
      url.searchParams.set("state", state);

      response = await fetch(url.toString(), {
        method: "GET",
      });
      break;
    }
    case "google": {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      });

      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      break;
    }
    default:
      throw Object.assign(new Error("Unsupported OAuth provider."), {
        status: 400,
      });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw Object.assign(new Error("Failed to exchange OAuth code."), {
      status: 502,
      details: payload,
    });
  }

  return payload.access_token;
}

async function requestUserProfile(config, accessToken) {
  let response;

  switch (config.key) {
    case "kakao":
      response = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      break;
    case "naver":
      response = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      break;
    case "google":
      response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      break;
    default:
      throw Object.assign(new Error("Unsupported OAuth provider."), {
        status: 400,
      });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw Object.assign(new Error("Failed to fetch provider profile."), {
      status: 502,
      details: payload,
    });
  }

  switch (config.key) {
    case "kakao": {
      const email = normalizeEmail(payload?.kakao_account?.email);
      const fullName = cleanText(
        payload?.kakao_account?.profile?.nickname || payload?.properties?.nickname || "",
        120,
      );

      if (!payload?.id || !email) {
        throw Object.assign(new Error("Kakao account email consent is required."), {
          status: 400,
        });
      }

      return {
        provider: "kakao",
        providerUserId: String(payload.id),
        email,
        fullName,
      };
    }
    case "naver": {
      const profile = payload?.response || null;
      const email = normalizeEmail(profile?.email);
      const fullName = cleanText(profile?.name || profile?.nickname || "", 120);

      if (!profile?.id || !email) {
        throw Object.assign(new Error("Naver account email consent is required."), {
          status: 400,
        });
      }

      return {
        provider: "naver",
        providerUserId: String(profile.id),
        email,
        fullName,
      };
    }
    case "google": {
      const email = normalizeEmail(payload?.email);
      const fullName = cleanText(payload?.name || payload?.given_name || "", 120);

      if (!payload?.sub || !email) {
        throw Object.assign(new Error("Google account email consent is required."), {
          status: 400,
        });
      }

      return {
        provider: "google",
        providerUserId: String(payload.sub),
        email,
        fullName,
      };
    }
    default:
      throw Object.assign(new Error("Unsupported OAuth provider."), {
        status: 400,
      });
  }
}

function buildAccountRedirectUrl(request, env, redirectPath, params = {}) {
  const baseUrl = getBaseUrl(request, env);
  const url = new URL(resolveRedirectPath(redirectPath), baseUrl);
  return appendRedirectParams(url, params).toString();
}

export async function startOAuthFlow(context) {
  const requestUrl = new URL(context.request.url);
  const provider = normalizeProvider(requestUrl.searchParams.get("provider"));
  const redirectPath = resolveRedirectPath(requestUrl.searchParams.get("redirect"));
  const config = getProviderConfig(context.env, context.request, provider);

  if (!config) {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, { authError: "unsupported_provider" }),
    );
  }

  if (!config.enabled) {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        authError: "provider_not_configured",
        provider: config.key,
      }),
    );
  }

  try {
    const state = randomHex(16);
    const payload = {
      provider: config.key,
      redirectPath,
      state,
      expiresAt: addMs(nowIso(), OAUTH_STATE_TTL_MS),
    };
    const token = await createStateToken(context.env, payload);
    const authorizeUrl = buildAuthorizeUrl(config, state);

    return createRedirectResponse(authorizeUrl, [
      createCookie(OAUTH_STATE_COOKIE_NAME, token, context.request, context.env, {
        maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
      }),
    ]);
  } catch {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        authError: "provider_not_configured",
        provider: config.key,
      }),
    );
  }
}

export async function completeOAuthFlow(context) {
  const requestUrl = new URL(context.request.url);
  const provider = normalizeProvider(requestUrl.searchParams.get("provider"));
  const config = getProviderConfig(context.env, context.request, provider);
  const cookies = parseCookies(context.request);
  const stateToken = cookies[OAUTH_STATE_COOKIE_NAME];
  const clearStateCookie = clearCookie(OAUTH_STATE_COOKIE_NAME, context.request, context.env);
  const fallbackRedirect = buildAccountRedirectUrl(context.request, context.env, DEFAULT_REDIRECT_PATH, {
    authError: "oauth_failed",
    provider,
  });

  if (!config || !config.enabled) {
    return createRedirectResponse(fallbackRedirect, [clearStateCookie]);
  }

  let storedState = null;

  try {
    storedState = await parseStateToken(context.env, stateToken);
  } catch {
    storedState = null;
  }

  if (!storedState || storedState.provider !== config.key) {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, DEFAULT_REDIRECT_PATH, {
        authError: "state_invalid",
        provider: config.key,
      }),
      [clearStateCookie],
    );
  }

  const redirectPath = resolveRedirectPath(storedState.redirectPath);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        authError: providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed",
        provider: config.key,
      }),
      [clearStateCookie],
    );
  }

  const state = cleanText(requestUrl.searchParams.get("state"), 120);
  const code = cleanText(requestUrl.searchParams.get("code"), 500);
  if (!state || !code || state !== storedState.state) {
    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        authError: "state_invalid",
        provider: config.key,
      }),
      [clearStateCookie],
    );
  }

  try {
    const accessToken = await requestAccessToken(config, code, state);
    const identity = await requestUserProfile(config, accessToken);
    const authenticated = await authenticateFederatedIdentity(context.env, identity, context.request);

    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        auth: "success",
        provider: config.key,
      }),
      [
        clearStateCookie,
        authenticated.session.cookie,
      ],
    );
  } catch (error) {
    const errorKey = error?.message?.includes("email consent") ? "email_required" : "oauth_failed";

    return createRedirectResponse(
      buildAccountRedirectUrl(context.request, context.env, redirectPath, {
        authError: errorKey,
        provider: config.key,
      }),
      [clearStateCookie],
    );
  }
}