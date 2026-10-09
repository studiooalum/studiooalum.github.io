import { readUnavailableEditions } from '../../../cloudflare/lib/inventory.js';
import { json, errorResponse } from '../../../cloudflare/lib/http.js';
export async function onRequestGet({env}) {
  try { return json(env, {ok:true, unavailable:await readUnavailableEditions(env)}, {headers:{'Cache-Control':'no-store'}}); }
  catch(error) { return errorResponse(env,error); }
}
