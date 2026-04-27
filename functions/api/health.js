import { hasD1 } from "../../cloudflare/lib/d1.js";
import { json, noContent } from "../../cloudflare/lib/http.js";
import { getTossConfig } from "../../cloudflare/lib/toss.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export function onRequestGet(context) {
  const toss = getTossConfig(context.env);

  return json(context.env, {
    ok: true,
    service: "studiooalum-pages-functions",
    timestamp: new Date().toISOString(),
    bindings: {
      d1: hasD1(context.env),
      tossClientKey: toss.isClientReady,
      tossSecretKey: toss.isServerReady,
    },
  });
}