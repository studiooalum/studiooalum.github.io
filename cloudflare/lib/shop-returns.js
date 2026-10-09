import { persistPayment, readOrderSyncSnapshot, syncOrderPointsState } from './d1.js';
import { syncOrderCouponState } from './coupons.js';
import { cancelTossPayment, readTossPayment } from './toss.js';
import { enqueueNotification, resolveNotificationAdminRecipient } from './notifications.js';

export const RETURN_REASONS = Object.freeze({change_of_mind:'단순 변심',size:'사이즈·착용감',defect:'상품 하자',wrong_item:'오배송',other:'기타'});
const labels = {pending:'검토 대기',awaiting_return:'반품 회수 대기',refunding:'환불 확인 중',reconcile:'환불 확인 중',completed:'환불 완료',rejected:'요청 반려'};
const fail = (message,status=409) => {throw Object.assign(new Error(message),{status});};
const now = () => new Date().toISOString();
const shipped = order => ['shipped','delivered','returned'].includes(order?.shipment?.status) || !!order?.shipment?.shippedAt;
export const suggestedReturnFee = (order,reason) => shipped(order) && ['change_of_mind','size'].includes(reason) ? 4000 : 0;
export function publicReturn(row) {
  return row ? {id:row.id,status:row.status,label:labels[row.status],reasonCode:row.reason_code,reasonNote:row.reason_note,
    shippingFee:row.shipping_fee,refundAmount:row.refund_amount,decisionNote:row.decision_note,requestedAt:row.created_at,completedAt:row.completed_at} : null;
}
export async function latestReturn(db,orderId) {
  return db.prepare("SELECT * FROM shop_returns WHERE order_id=? ORDER BY (status<>'rejected') DESC,created_at DESC,id DESC LIMIT 1").bind(orderId).first();
}
export function customerReturnState(order,request) {
  if (request && request.status !== 'rejected') return {available:false,action:null,buttonLabel:'',status:request.status,
    message:`반품·환불 ${labels[request.status]}${request.decision_note ? ` · ${request.decision_note}` : ''}`,request:publicReturn(request)};
  if (!['ready','packing','shipped','delivered','returned','cancelled'].includes(order?.shipment?.status) && !shipped(order)) return null;
  if (!['confirmed','paid','done','completed','success','succeeded'].includes(order?.paymentStatus)) return null;
  return {available:true,action:'request_approval',buttonLabel:'반품·환불 요청',status:'approval_required',
    message:[request?.status==='rejected' ? `이전 요청 반려: ${request.decision_note}` : '', '사유를 접수하면 관리자가 확인합니다. 발송 후 단순 변심·사이즈 반품은 배송비 4,000원이 공제됩니다.'].filter(Boolean).join(' · '),request:publicReturn(request)};
}

async function notifyReturn(env,row) {
  const order=await readOrderSyncSnapshot(env,row.order_id);
  const origin=env.PUBLIC_SITE_URL || 'https://studiooalum.com';
  for (const admin of [false,true]) await enqueueNotification(env,{
    eventKey:`return:${row.id}:${row.status}:${row.status==='completed'?`${row.refund_amount}:`:''}${admin?'admin':'customer'}`,entityType:'order',entityId:row.order_id,channel:'email',
    templateKey:`shop.return_update${admin?'_admin':''}`,recipient:admin?resolveNotificationAdminRecipient(env):order.customer.email,
    payload:{order_number:row.order_id,product_name:order.orderName,refund_status:labels[row.status],
      refund_reason:[RETURN_REASONS[row.reason_code],row.reason_note,row.decision_note].filter(Boolean).join(' / '),
      refund_amount:`${Number(row.refund_amount ?? Math.max(0,order.totalAmount-row.shipping_fee)).toLocaleString('ko-KR')}원`,
      return_fee:`${row.shipping_fee.toLocaleString('ko-KR')}원`,
      order_url:new URL(admin?`/admin?orderId=${encodeURIComponent(row.order_id)}`:'/account',origin).href},
  });
  await env.OALUM_DB.prepare('UPDATE shop_returns SET notified_at=? WHERE id=? AND status=?').bind(now(),row.id,row.status).run();
}

export async function requestShopReturn(context,{order,reasonCode,reasonNote=''}) {
  if (!Object.hasOwn(RETURN_REASONS,reasonCode)) fail('반품·환불 사유를 선택해주세요.',400);
  reasonNote=String(reasonNote).trim();
  if (reasonNote.length>400 || (reasonCode==='other' && reasonNote.length<2)) fail('기타 사유를 2~400자로 입력해주세요.',400);
  const db=context.env.OALUM_DB;
  let existing=await latestReturn(db,order.orderId);
  if(existing && existing.status!=='rejected') return publicReturn(existing);
  if (!customerReturnState(order,null)?.available) fail('현재 주문은 반품·환불을 요청할 수 없습니다.');
  const id=`RET_${crypto.randomUUID().replace(/-/g,'')}`;
  const date=now();
  await db.prepare(`INSERT OR IGNORE INTO shop_returns(id,order_id,reason_code,reason_note,shipping_fee,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).bind(id,order.orderId,reasonCode,reasonNote,suggestedReturnFee(order,reasonCode),date,date).run();
  existing=await latestReturn(db,order.orderId);
  // The request remains visible to the administrator even if notification storage is temporarily unavailable.
  try { await notifyReturn(context.env,existing); } catch(error) { console.error('Return notification queued for retry', {id:existing.id,message:error.message}); }
  return publicReturn(existing);
}

export async function settleShopReturn(env,payment) {
  const db=env.OALUM_DB;
  let row=await db.prepare("SELECT * FROM shop_returns WHERE order_id=? AND status<>'rejected' LIMIT 1").bind(payment.orderId).first();
  if(!row) return false;
  const order=await readOrderSyncSnapshot(env,row.order_id);
  if (payment.paymentKey!==order?.payment?.paymentKey || payment.currency!=='KRW' || payment.totalAmount!==order.totalAmount) return false;
  // A full cancellation made in the Toss console also closes an outstanding request.
  // Partial cancellations still require our exact refund reference and amount.
  if (payment.status==='CANCELED' && payment.balanceAmount===0 && (row.status!=='completed' || row.shipping_fee!==0)) {
    await db.prepare("UPDATE shop_returns SET status='reconcile',shipping_fee=0,refund_amount=?,updated_at=?,notified_at=NULL WHERE id=?")
      .bind(order.totalAmount,now(),row.id).run();
    row=await latestReturn(db,row.order_id);
  }
  if (!['refunding','reconcile','completed'].includes(row.status)) return false;
  const matches = payment.paymentKey===order?.payment?.paymentKey && payment.currency==='KRW'
    && payment.totalAmount===order.totalAmount && payment.balanceAmount===row.shipping_fee
    && payment.status===(row.shipping_fee?'PARTIAL_CANCELED':'CANCELED')
    && (payment.status==='CANCELED' || payment.cancels?.some(c=>c.cancelAmount===row.refund_amount && String(c.cancelReason).includes(row.id) && (!c.cancelStatus || c.cancelStatus==='DONE')));
  if(!matches) return false;
  if(row.status!=='completed') {
    await persistPayment(env,{...payment,amount:payment.totalAmount,providerMode:'shop-return',rawResponse:payment});
    // Commercial return is complete even when the provider retains the agreed shipping fee.
    // This also releases inventory; provider partial-cancel status is retained on the payment record.
    await db.prepare("UPDATE orders SET status='refunded', updated_at=? WHERE id=?").bind(now(),row.order_id).run();
    await syncOrderCouponState(env,row.order_id,{now:now()});
    await syncOrderPointsState(db,row.order_id,now());
    await db.prepare("UPDATE shipments SET status=CASE WHEN shipped_at IS NOT NULL OR status IN ('shipped','delivered','returned') THEN 'returned' ELSE 'cancelled' END, updated_at=? WHERE order_id=?").bind(now(),row.order_id).run();
    await db.prepare("UPDATE shop_returns SET status='completed',completed_at=?,updated_at=?,notified_at=NULL WHERE id=?").bind(now(),now(),row.id).run();
  }
  await notifyReturn(env,await latestReturn(db,row.order_id));
  return true;
}

export async function decideShopReturn(context,{id,action,shippingFee=0,note='',received=false}) {
  const env=context.env,db=env.OALUM_DB;
  let row=await db.prepare('SELECT * FROM shop_returns WHERE id=?').bind(id).first();
  if(!row) fail('요청을 찾을 수 없습니다.',404);
  if(!['approve','reject','refund','reconcile'].includes(action)) fail('잘못된 처리입니다.',400);
  const order=await readOrderSyncSnapshot(env,row.order_id);
  if(row.status==='completed') {await notifyReturn(env,row);return publicReturn(row);}
  if(['refunding','reconcile'].includes(row.status)) {
    // Never create a second cancellation after an uncertain provider response.
    const payment=await readTossPayment(env,order.payment.paymentKey);
    if(!await settleShopReturn(env,payment)) fail('토스 환불 결과 확인이 필요합니다. 관리자에서 결제 내역을 확인해주세요.');
    return publicReturn(await latestReturn(db,row.order_id));
  }
  if(action==='reconcile' || row.status==='rejected') fail('처리 가능한 요청이 아닙니다.');
  if(action==='reject') {
    if(!String(note).trim()) fail('고객에게 안내할 반려 사유를 입력해주세요.',400);
    await db.prepare("UPDATE shop_returns SET status='rejected',decision_note=?,updated_at=?,notified_at=NULL WHERE id=? AND status IN ('pending','awaiting_return')").bind(String(note).trim().slice(0,400),now(),id).run();
  } else if(action==='approve' && shipped(order)) {
    if(row.status!=='pending') fail('이미 회수 대기 중입니다.');
    if(!String(note).trim()) fail('회수 방법과 주소 등 반품 안내를 입력해주세요.',400);
    if(![0,4000].includes(shippingFee) || (shippingFee && !suggestedReturnFee(order,row.reason_code))) fail('이 사유에는 배송비를 공제할 수 없습니다.',400);
    await db.prepare("UPDATE shop_returns SET status='awaiting_return',shipping_fee=?,decision_note=?,updated_at=?,notified_at=NULL WHERE id=? AND status='pending'").bind(shippingFee,String(note).trim().slice(0,400),now(),id).run();
  } else {
    if(shipped(order) && (row.status!=='awaiting_return' || !received)) fail('반품 승인 후 상품 회수를 확인해야 환불할 수 있습니다.');
    if(!shipped(order) && row.status!=='pending') fail('처리 상태를 다시 확인해주세요.');
    if(![0,4000].includes(shippingFee) || (shippingFee && !suggestedReturnFee(order,row.reason_code))) fail('발송 후 단순 변심·사이즈 반품만 4,000원을 공제할 수 있습니다.',400);
    const amount=order.totalAmount-shippingFee;
    if(amount<=0) fail('환불 금액이 0원 이하입니다. 배송비 면제 또는 별도 확인이 필요합니다.');
    const before=await readTossPayment(env,order.payment.paymentKey);
    if(before.orderId!==order.orderId || before.paymentKey!==order.payment.paymentKey || before.totalAmount!==order.totalAmount || before.currency!=='KRW'
      || before.status!=='DONE' || before.balanceAmount!==order.totalAmount) fail('이미 취소되었거나 부분 취소된 결제입니다. 토스 내역을 먼저 확인해주세요.');
    const claimed=await db.prepare("UPDATE shop_returns SET status='refunding',shipping_fee=?,refund_amount=?,received_at=?,decision_note=?,updated_at=?,notified_at=NULL WHERE id=? AND status=?")
      .bind(shippingFee,amount,received?now():null,String(note).trim().slice(0,400),now(),id,row.status).run();
    if(!Number(claimed.meta?.changes)) fail('다른 관리자가 처리 중입니다. 새로고침해주세요.');
    try {
      const payment=await cancelTossPayment(env,{paymentKey:order.payment.paymentKey,orderId:order.orderId,amount:order.totalAmount,
        cancelAmount:amount,idempotencyKey:`return-${id}`,cancelReason:`반품 ${id} ${RETURN_REASONS[row.reason_code]}`});
      if(!await settleShopReturn(env,payment.rawResponse)) fail('환불 결과를 저장하지 못했습니다. 결제 내역 확인이 필요합니다.');
    } catch(error) {
      await db.prepare("UPDATE shop_returns SET status='reconcile',updated_at=? WHERE id=? AND status='refunding'").bind(now(),id).run();
      try { await notifyReturn(env,await latestReturn(db,row.order_id)); } catch(notificationError) { console.error('Return notification needs retry',{id,message:notificationError.message}); }
      throw error;
    }
  }
  row=await latestReturn(db,row.order_id);
  await notifyReturn(env,row);
  return publicReturn(row);
}

export async function maintainShopReturns(env) {
  const rows=await env.OALUM_DB.prepare("SELECT * FROM shop_returns WHERE status IN ('refunding','reconcile') OR notified_at IS NULL ORDER BY updated_at LIMIT 30").all();
  for(const row of rows.results||[]) {
    try {
      if(['refunding','reconcile'].includes(row.status)) {
        const order=await readOrderSyncSnapshot(env,row.order_id);
        await settleShopReturn(env,await readTossPayment(env,order.payment.paymentKey,{timeoutMs:6000}));
        const current=await latestReturn(env.OALUM_DB,row.order_id);
        if(!current.notified_at) await notifyReturn(env,current);
      } else await notifyReturn(env,row);
    } catch(error) {console.error('Shop return needs retry',{id:row.id,message:error.message});}
  }
}
