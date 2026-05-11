import { startOAuthFlow } from "../../../../cloudflare/lib/oauth.js";

export function onRequestGet(context) {
  return startOAuthFlow(context);
}