import { completeOAuthFlow } from "../../../../cloudflare/lib/oauth.js";

export function onRequestGet(context) {
  return completeOAuthFlow(context);
}