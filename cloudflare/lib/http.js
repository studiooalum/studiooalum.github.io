function getCorsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env?.ALLOWED_ORIGIN || "https://studiooalum.com",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, X-Guest-Access-Token, X-Repair-Ticket-Access",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
}

export function json(env, data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
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
  const contentType = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw Object.assign(new Error("JSON 형식의 요청이 필요합니다."), { status: 415 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty_body");
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw Object.assign(new Error("요청 크기가 너무 큽니다."), { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error.status === 413) throw error;
    throw Object.assign(new Error("입력 형식이 올바르지 않습니다."), {
      status: 400,
    });
  }
}

export function validationError(env, zodError) {
  return json(env, {
    ok: false,
    error: "입력한 내용을 다시 확인해주세요.",
    details: zodError.flatten(),
  }, {
    status: 400,
  });
}

export function errorResponse(env, error, fallbackMessage = "Unexpected error.") {
  const candidateStatus = Number(error?.status);
  const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
  const body = {
    ok: false,
    error: status >= 500 ? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." : error?.message || fallbackMessage,
  };

  if (status < 500 && error?.details) {
    body.details = error.details;
  }

  return json(env, body, { status });
}