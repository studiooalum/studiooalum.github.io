import { listOAuthProviders } from "../../../cloudflare/lib/oauth.js";
import { json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export function onRequestGet(context) {
  return json(context.env, {
    ok: true,
    direct: {
      key: "direct",
      label: "이메일로 가입 / 로그인",
      enabled: true,
    },
    providers: listOAuthProviders(context.env),
  });
}