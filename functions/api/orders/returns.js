import { z } from 'zod';
import { requireAdminAccess } from '../../../cloudflare/lib/admin.js';
import { decideShopReturn, publicReturn } from '../../../cloudflare/lib/shop-returns.js';
import { errorResponse,json,readJson,validationError } from '../../../cloudflare/lib/http.js';
const schema=z.object({id:z.string().min(1).max(80),action:z.enum(['approve','reject','refund','reconcile']),shippingFee:z.literal(0).default(0),note:z.string().trim().max(400).default(''),received:z.boolean().default(false)});
export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);
    const rows=await context.env.OALUM_DB.prepare("SELECT * FROM shop_returns WHERE status<>'completed' AND status<>'rejected' ORDER BY created_at LIMIT 100").all();
    return json(context.env,{ok:true,requests:(rows.results||[]).map(row=>({...publicReturn(row),orderId:row.order_id}))});
  } catch(error) {return errorResponse(context.env,error);}
}
export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);
    const parsed=schema.safeParse(await readJson(context.request));
    if(!parsed.success) return validationError(context.env,parsed.error);
    return json(context.env,{ok:true,request:await decideShopReturn(context,parsed.data)});
  } catch(error) {return errorResponse(context.env,error);}
}
