function getCorsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env?.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function json(env, data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...getCorsHeaders(env),
      ...(init.headers || {}),
    },
  });
}

export function noContent(env, init = {}) {
  return new Response(null, {
    status: init.status || 204,
    headers: {
      ...getCorsHeaders(env),
      ...(init.headers || {}),
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), {
      status: 400,
    });
  }
}

export function validationError(env, zodError) {
  return json(env, {
    ok: false,
    error: "Invalid request payload.",
    details: zodError.flatten(),
  }, {
    status: 400,
  });
}

export function errorResponse(env, error, fallbackMessage = "Unexpected error.") {
  const status = Number(error?.status) || 500;
  const body = {
    ok: false,
    error: error?.message || fallbackMessage,
  };

  if (error?.details) {
    body.details = error.details;
  }

  return json(env, body, { status });
}