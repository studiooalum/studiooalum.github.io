import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { persistOrder, persistPayment, readOrderSyncSnapshot } from '../cloudflare/lib/d1.js';
import { requestShopReturn, decideShopReturn, latestReturn, settleShopReturn } from '../cloudflare/lib/shop-returns.js';
import { readUnavailableEditions } from '../cloudflare/lib/inventory.js';
import { applyInventory } from '../runtime/storefront/scripts/utils/inventory.js';
import { onRequestPost as confirm } from '../functions/api/payments/confirm.js';
import { onRequestPost as webhook } from '../functions/api/webhooks/toss.js';
import { onRequestPost as returnEndpoint } from '../functions/api/orders/returns.js';
import { onRequestPost as customerCancel } from '../functions/api/auth/orders/cancel.js';
import { onRequestPost as legacyDecision } from '../functions/api/orders/cancellation/decision.js';
import { lookupGuestResource } from '../cloudflare/lib/guest-lookup.js';

function setup(t) {
  const sql=new DatabaseSync(':memory:');
  for(const file of ['schema.sql','migrations/0035_workshop_operations.sql','migrations/0037_operational_notifications.sql','migrations/0038_payment_reservation_guards.sql','migrations/0042_payment_review_notification.sql','migrations/0045_shop_returns_inventory.sql']) sql.exec(readFileSync(new URL('../cloudflare/d1/'+file,import.meta.url),'utf8'));
  const db={prepare(query){const stmt=sql.prepare(query);const bind=(...args)=>({first:()=>stmt.get(...args)||null,all:()=>({results:stmt.all(...args)}),run:()=>({meta:{changes:Number(stmt.run(...args).changes)}})});return {...bind(),bind};},batch(stmts){sql.exec('BEGIN');try {const r=stmts.map(s=>s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const env={OALUM_DB:db,TOSS_CLIENT_KEY:'test_gck_fixture',TOSS_SECRET_KEY:'test_gsk_fixture',REPAIR_ADMIN_EMAIL:'admin@example.com',ORDER_ADMIN_SECRET:'fixture-admin',PUBLIC_SITE_URL:'https://studiooalum.test',AUTH_SECRET:'fixture-auth'};
  t.after(()=>sql.close());
  return {db,sql,env};
}
const date=()=>new Date().toISOString();
function order(id,product='edition-one') {return {orderId:id,orderName:'Studio OALUM · Fixture',status:'created',paymentStatus:'pending',subtotalAmount:43000,shippingAmount:4000,total:47000,items:[{lineId:product,productId:product,title:'Fixture edition',price:43000,qty:1}],shipping:{name:'Fixture',phone:'010-1111-2222',email:'buyer@example.com',zipcode:'01234',address1:'Fixture',address2:''}};}
function payment(id){return {orderId:id,paymentKey:'key-'+id,totalAmount:47000,amount:47000,currency:'KRW',balanceAmount:47000,status:'DONE',approvedAt:date()};}
async function paid(env,id,status='shipped') {
  await persistOrder(env,order(id));
  await persistPayment(env,payment(id));
  await env.OALUM_DB.prepare('UPDATE shipments SET status=?,shipped_at=? WHERE order_id=?').bind(status,['shipped','delivered'].includes(status)?date():null,id).run();
  return readOrderSyncSnapshot(env,id);
}
function provider(t,id,{uncertain=false}={}) {
  const previous=globalThis.fetch;
  let current=payment(id),posts=0;
  globalThis.fetch=async(url,init={})=>{
    assert.match(String(url),/^https:\/\/api.tosspayments.com\//,'tests must not contact real providers');
    if(init.method==='POST') {
      posts++;
      const body=JSON.parse(init.body);
      assert.match(init.headers['Idempotency-Key'],/^return-RET_/);
      current={...current,status:body.cancelAmount===47000?'CANCELED':'PARTIAL_CANCELED',balanceAmount:47000-body.cancelAmount,cancels:[{...body,cancelStatus:'DONE',canceledAt:date()}]};
      if(uncertain) {const saved=current;current=payment(id);setImmediate(()=>{current=saved;});throw new TypeError('Response lost');}
    }
    return Response.json(current);
  };
  t.after(()=>{globalThis.fetch=previous;});
  return {get posts(){return posts;},get current(){return current;}};
}
function ctx(env,path,body,headers={}){return {env,request:new Request('https://studiooalum.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),waitUntil(p){p.catch(()=>{});}};}

test('one edition cannot be confirmed by two different orders; failed approval releases the claim',async t=>{
  const {env,db}=setup(t);
  await persistOrder(env,order('ORDER_ONE'));await persistOrder(env,order('ORDER_TWO'));
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  let calls=0;globalThis.fetch=async(url,init)=>{if(String(url).includes('.sanity.io/'))return Response.json({result:[{_id:'edition-one',soldOut:false}]});calls++;return Response.json(payment(JSON.parse(init.body).orderId));};
  const responses=await Promise.all(['ORDER_ONE','ORDER_TWO'].map(id=>confirm(ctx(env,'/api/payments/confirm',{orderId:id,paymentKey:'key-'+id,amount:47000}))));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(calls,1);
  assert.deepEqual(await readUnavailableEditions(env),['edition-one']);
  const winner=await db.prepare('SELECT order_id FROM edition_claims').first();
  await db.prepare("UPDATE orders SET status='refunded' WHERE id=?").bind(winner.order_id).run();
  assert.deepEqual(await readUnavailableEditions(env),[]);
});

test('ready order requires a valid reason, blocks shipment, and supports one full refund',async t=>{
  const {env,db}=setup(t);const snapshot=await paid(env,'RETURN_READY','ready');const api=provider(t,snapshot.orderId);
  await assert.rejects(requestShopReturn({env},{order:snapshot,reasonCode:'other',reasonNote:''}),{status:400});
  const r=await requestShopReturn({env},{order:snapshot,reasonCode:'other',reasonNote:'일정 변경'});
  assert.equal((await requestShopReturn({env},{order:snapshot,reasonCode:'other',reasonNote:'중복 요청'})).id,r.id);
  assert.throws(()=>db.prepare("UPDATE shipments SET status='shipped' WHERE order_id=?").bind(snapshot.orderId).run(),/RETURN_PENDING/);
  const result=await decideShopReturn({env},{id:r.id,action:'approve'});
  assert.equal(result.refundAmount,47000);assert.equal(result.status,'completed');
  await decideShopReturn({env},{id:r.id,action:'approve'});assert.equal(api.posts,1);
  assert.deepEqual(await readUnavailableEditions(env),[]);
  const notifications=await db.prepare("SELECT event_key,payload_json FROM notification_outbox WHERE template_key LIKE 'shop.return_update%'").all();
  assert.equal(notifications.results.length,4);
  assert.ok(notifications.results.some(r=>JSON.parse(r.payload_json).order_url==='https://studiooalum.test/admin?orderId=RETURN_READY'));
});

test('shipped change of mind needs receipt and refunds the full 47000 including checkout shipping',async t=>{
  const {env,db}=setup(t);const snapshot=await paid(env,'RETURN_SHIPPED');const api=provider(t,snapshot.orderId);
  const r=await requestShopReturn({env},{order:snapshot,reasonCode:'change_of_mind'});
  assert.equal(r.shippingFee,0);
  await assert.rejects(decideShopReturn({env},{id:r.id,action:'refund',received:true}),{status:409});
  assert.equal((await decideShopReturn({env},{id:r.id,action:'approve',note:'안내된 주소로 회수합니다.'})).status,'awaiting_return');
  assert.equal(api.posts,0);assert.deepEqual(await readUnavailableEditions(env),['edition-one']);
  await assert.rejects(decideShopReturn({env},{id:r.id,action:'refund'}),{status:409});
  await assert.rejects(decideShopReturn({env},{id:r.id,action:'refund',shippingFee:4000,received:true}),{status:400});
  assert.equal(api.posts,0);
  const result=await decideShopReturn({env},{id:r.id,action:'refund',received:true});
  assert.equal(result.refundAmount,47000);assert.equal(api.posts,1);
  const final=await readOrderSyncSnapshot(env,snapshot.orderId);
  assert.equal(final.status,'refunded');assert.equal(final.shipment.status,'returned');assert.equal(final.paymentStatus,'cancelled');
  assert.deepEqual(await readUnavailableEditions(env),[]);
  for(let i=0;i<2;i++) assert.equal((await webhook(ctx(env,'/api/webhooks/toss',{eventType:'PAYMENT_STATUS_CHANGED',data:{paymentKey:api.current.paymentKey}}))).status,200);
  assert.equal(api.posts,1);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM notification_outbox WHERE event_key LIKE '%:completed:%'").first()).n,2);
});

test('defect refunds cannot deduct shipping and rejection permits a new request',async t=>{
  const {env}=setup(t);const snapshot=await paid(env,'RETURN_DEFECT','delivered');const api=provider(t,snapshot.orderId);
  let r=await requestShopReturn({env},{order:snapshot,reasonCode:'defect'});
  await decideShopReturn({env},{id:r.id,action:'reject',note:'추가 사진을 첨부해 다시 요청해주세요.'});
  const newRequest=await requestShopReturn({env},{order:snapshot,reasonCode:'defect',reasonNote:'상품 하자 설명'});assert.notEqual(newRequest.id,r.id);r=newRequest;
  await decideShopReturn({env},{id:r.id,action:'approve',note:'회수 안내'});
  await assert.rejects(decideShopReturn({env},{id:r.id,action:'refund',shippingFee:4000,received:true}),{status:400});
  assert.equal(api.posts,0);
  assert.equal((await decideShopReturn({env},{id:r.id,action:'refund',shippingFee:0,received:true})).refundAmount,47000);
});

test('lost refund response reconciles without another cancellation POST',async t=>{
  const {env,db}=setup(t);const snapshot=await paid(env,'RETURN_UNCERTAIN','ready');const api=provider(t,snapshot.orderId,{uncertain:true});
  const r=await requestShopReturn({env},{order:snapshot,reasonCode:'size'});
  await assert.rejects(decideShopReturn({env},{id:r.id,action:'approve'}));
  assert.equal((await latestReturn(db,snapshot.orderId)).status,'reconcile');
  assert.deepEqual(await readUnavailableEditions(env),['edition-one']);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await decideShopReturn({env},{id:r.id,action:'reconcile'})).status,'completed');assert.equal(api.posts,1);
});

test('unrecognized partial refund does not reopen inventory; manual Sanity stop survives automatic release',async t=>{
  const {env}=setup(t);const snapshot=await paid(env,'RETURN_EXTERNAL');
  assert.equal(await settleShopReturn(env,{...payment(snapshot.orderId),status:'PARTIAL_CANCELED',balanceAmount:4000}),false);
  assert.deepEqual(await readUnavailableEditions(env),['edition-one']);
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  globalThis.fetch=async()=>Response.json({ok:true,unavailable:[]});
  const result=await applyInventory([{_id:'edition-one',soldOut:true},{_id:'edition-two',soldOut:false}]);
  assert.equal(result[0].soldOut,true);assert.equal(result[1].soldOut,false);
});

test('refund approval requires administrator credentials and legacy email bearer links cannot approve',async t=>{
  const {env}=setup(t);
  assert.equal((await returnEndpoint(ctx(env,'/api/orders/returns',{id:'fake',action:'refund'}))).status,401);
  assert.equal(legacyDecision().status,410);
  const snapshot=await paid(env,'RETURN_GUEST','ready');
  const lookup=await lookupGuestResource(env,new Request('https://studiooalum.test'),{reference:'ORD-'+snapshot.orderId,email:'buyer@example.com'});
  const token=lookup.accessToken;
  assert.ok(token);
  assert.equal((await customerCancel(ctx(env,'/api/auth/orders/cancel',{orderId:'OTHER_ORDER',reasonCode:'size'},{'X-Guest-Access-Token':token}))).status,403);
  const response=await customerCancel(ctx(env,'/api/auth/orders/cancel',{orderId:snapshot.orderId,reasonCode:'size'},{'X-Guest-Access-Token':token}));
  assert.equal(response.status,200);assert.equal((await response.json()).request.status,'pending');
});

test('refund reverses earned points and restores spent points and coupon exactly once',async t=>{
  const {env,db,sql}=setup(t);const snapshot=await paid(env,'RETURN_BENEFITS','delivered');const api=provider(t,snapshot.orderId);
  sql.exec(`INSERT INTO users(id,email,email_normalized,created_at,updated_at) VALUES('USER','buyer@example.com','buyer@example.com','2026-10-01','2026-10-01');
    INSERT INTO coupons(id,code,title,discount_type,discount_value,created_at,updated_at) VALUES('COUPON','FIXTURE','Fixture','fixed',1000,'2026-10-01','2026-10-01');
    UPDATE orders SET user_id='USER',points_used=1000,points_spent_at='2026-10-01',points_earned=100,points_earned_at='2026-10-01',coupon_id='COUPON',coupon_applied_at='2026-10-01' WHERE id='RETURN_BENEFITS';
    INSERT INTO coupon_redemptions(coupon_id,order_id,status,created_at,updated_at) VALUES('COUPON','RETURN_BENEFITS','applied','2026-10-01','2026-10-01');`);
  const r=await requestShopReturn({env},{order:snapshot,reasonCode:'size'});
  await decideShopReturn({env},{id:r.id,action:'approve',note:'회수 안내'});
  const results=await Promise.allSettled([1,2].map(()=>decideShopReturn({env},{id:r.id,action:'refund',received:true})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(api.posts,1);
  await settleShopReturn(env,api.current);
  const points=await db.prepare('SELECT kind,points_delta FROM point_transactions WHERE order_id=? ORDER BY kind').bind(snapshot.orderId).all();
  assert.deepEqual(points.results.map(r=>({...r})),[{kind:'earn_reversal',points_delta:-100},{kind:'spend_refund',points_delta:1000}]);
  assert.equal((await db.prepare("SELECT status FROM coupon_redemptions WHERE order_id='RETURN_BENEFITS'").first()).status,'released');
});

test('manual sold-out applied after order creation prevents provider approval',async t=>{
  const {env}=setup(t);await persistOrder(env,order('ORDER_MANUAL_STOP'));
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  globalThis.fetch=async url=>{assert.match(String(url),/sanity.io/);return Response.json({result:[{_id:'edition-one',soldOut:true}]});};
  const response=await confirm(ctx(env,'/api/payments/confirm',{orderId:'ORDER_MANUAL_STOP',paymentKey:'key-ORDER_MANUAL_STOP',amount:47000}));
  assert.equal(response.status,409);assert.deepEqual(await readUnavailableEditions(env),[]);
});

test('Toss console full cancellation closes an outstanding return and restores inventory',async t=>{
  const {env,db}=setup(t);const snapshot=await paid(env,'RETURN_CONSOLE');
  await requestShopReturn({env},{order:snapshot,reasonCode:'change_of_mind'});
  assert.equal(await settleShopReturn(env,{...payment(snapshot.orderId),status:'CANCELED',balanceAmount:0}),true);
  const result=await latestReturn(db,snapshot.orderId);
  assert.equal(result.status,'completed');assert.equal(result.refund_amount,47000);assert.equal(result.shipping_fee,0);
  assert.deepEqual(await readUnavailableEditions(env),[]);
});

test('full refund migration resets only unstarted requests and preserves committed cancellation amounts',async t=>{
  const {env,db,sql}=setup(t);
  for(const status of ['pending','awaiting_return','refunding','reconcile','completed']) {
    const id='ORDER_'+status;await persistOrder(env,order(id,id));
    db.prepare('INSERT INTO shop_returns(id,order_id,reason_code,status,shipping_fee,refund_amount,created_at,updated_at) VALUES(?,?,?,?,4000,43000,?,?)')
      .bind('RET_'+status,id,'change_of_mind',status,date(),date()).run();
  }
  sql.exec(readFileSync(new URL('../cloudflare/d1/migrations/0046_shop_returns_full_refund.sql',import.meta.url),'utf8'));
  for(const status of ['pending','awaiting_return','refunding','reconcile','completed']) {
    const row=await latestReturn(db,'ORDER_'+status),unstarted=['pending','awaiting_return'].includes(status);
    assert.equal(row.shipping_fee,unstarted?0:4000);assert.equal(row.refund_amount,unstarted?null:43000);
  }
});

test('legacy in-flight partial cancellation still reconciles without issuing an extra refund',async t=>{
  const {env,db}=setup(t);const snapshot=await paid(env,'RETURN_LEGACY');
  const r=await requestShopReturn({env},{order:snapshot,reasonCode:'size'});
  await db.prepare("UPDATE shop_returns SET status='reconcile',shipping_fee=4000,refund_amount=43000 WHERE id=?").bind(r.id).run();
  const before={...payment(snapshot.orderId),status:'PARTIAL_CANCELED',balanceAmount:4000,cancels:[{cancelAmount:43000,cancelReason:'반품 '+r.id,cancelStatus:'DONE'}]};
  assert.equal(await settleShopReturn(env,before),true);
  assert.equal((await latestReturn(db,snapshot.orderId)).refund_amount,43000);
  assert.deepEqual(await readUnavailableEditions(env),[]);
});
