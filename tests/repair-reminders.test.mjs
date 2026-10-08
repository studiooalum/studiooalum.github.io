import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { enqueueRepairReminders } from '../cloudflare/lib/repair-reminders.js';
import { nextReminderSendTime } from '../cloudflare/lib/repair-reminder-policy.js';
import { processNotificationOutbox, createManualNotificationRetry, activateNotificationDraft } from '../cloudflare/lib/notifications.js';
import { reportNotificationFailure, reconcileNotificationFailures, monitorDirectEmail } from '../cloudflare/lib/notification-failures.js';
import { sendSolapiNotification } from '../cloudflare/lib/sms-provider-solapi.js';

class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec('PRAGMA foreign_keys=ON'); this.db.exec(readFileSync(new URL('../cloudflare/d1/schema.sql', import.meta.url),'utf8')); }
  prepare(sql) {
    const stmt=this.db.prepare(sql);
    const bound=(values=[])=>({ first:()=>stmt.get(...values)||null, all:()=>({results:stmt.all(...values)}), run:()=>({meta:{changes:Number(stmt.run(...values).changes)}}) });
    return {...bound(),bind:(...values)=>bound(values)};
  }
  batch(statements) { this.db.exec('BEGIN IMMEDIATE'); try {const results=statements.map(s=>s.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;} }
}
const now=new Date('2026-10-07T01:00:00.000Z');
function setup(t) {
 const db=new D1();t.after(()=>db.db.close());
 const env={OALUM_DB:db,AUTH_SECRET:'test',PUBLIC_SITE_URL:'https://studiooalum.test',SMS_ENABLED:'true',SMS_DRY_RUN:'false',SOLAPI_API_KEY:'test',SOLAPI_API_SECRET:'test',SOLAPI_SENDER_NUMBER:'01011112222',RESEND_API_KEY:'send-key',RESEND_MONITOR_API_KEY:'monitor-key',RESEND_FROM_EMAIL:'sender@example.com',REPAIR_ADMIN_EMAIL:'admin@example.com'};
 db.prepare(`INSERT INTO repair_requests(id,request_number,customer_name,email,email_normalized,phone,country_code,terms_accepted_at,privacy_consent_at,created_at,updated_at) VALUES ('R','REP','고객','c@example.com','c@example.com','01012345678','KR',?,?,?,?)`).bind(now.toISOString(),now.toISOString(),now.toISOString(),now.toISOString()).run();
 db.prepare(`INSERT INTO repair_tickets(id,repair_id,short_code,status,created_at,updated_at) VALUES ('T','R','short-code','open',?,?)`).bind(now.toISOString(),now.toISOString()).run();
 db.prepare(`INSERT INTO repair_ticket_messages(id,ticket_id,author_type,body,created_at) VALUES ('M','T','admin','확인 부탁드립니다.','2026-10-06T01:00:00.000Z')`).run();
 return {env,db};
}
const reminder=db=>db.prepare("SELECT * FROM notification_outbox WHERE template_key='ticket.unread_reminder'").first();
async function dispatch(env,db,options={}) {
 return processNotificationOutbox(env,{now,ids:[reminder(db).id],fetchImpl:async()=>Response.json({groupInfo:{groupId:'G'}}),...options});
}
test('KST 09:00 inclusive, 21:00 exclusive and next-day scheduling',()=>{
 for(const [from,to] of [['2026-10-06T23:59:59Z','2026-10-07T00:00:00.000Z'],['2026-10-07T00:00:00Z','2026-10-07T00:00:00.000Z'],['2026-10-07T11:59:59Z','2026-10-07T11:59:59.000Z'],['2026-10-07T12:00:00Z','2026-10-08T00:00:00.000Z'],['2026-10-07T15:01:00Z','2026-10-08T00:00:00.000Z']]) assert.equal(nextReminderSendTime(new Date(from)).toISOString(),to);
});
test('existing ticket qualifies at exactly 24h and repeated concurrent scans reserve once',async t=>{
 const {env,db}=setup(t);
 assert.equal((await enqueueRepairReminders(env,{now:new Date(now.getTime()-1)})).queued,0);
 const results=await Promise.all([enqueueRepairReminders(env,{now}),enqueueRepairReminders(env,{now})]);
 assert.equal(results.reduce((s,r)=>s+r.queued,0),1);assert.match(reminder(db).body_text,/확인이 필요한 수선 메시지/);assert.match(reminder(db).body_text,/https:\/\/studiooalum.test\/t\/short-code/);
 let sends=0;await Promise.all([dispatch(env,db,{fetchImpl:async()=>{sends++;return Response.json({groupInfo:{groupId:'G'}});}}),dispatch(env,db)]);
 assert.equal(sends,1);assert.equal(reminder(db).status,'sent');
 db.prepare("DELETE FROM notification_outbox").run();assert.equal((await enqueueRepairReminders(env,{now})).queued,0);
});
for(const [name,sql] of [
 ['read',"UPDATE repair_ticket_messages SET read_at='2026-10-06T02:00:00Z'"],
 ['closed',"UPDATE repair_tickets SET status='closed'"],
 ['cancelled',"UPDATE repair_requests SET status='cancelled'"],
 ['customer replied',"INSERT INTO repair_ticket_messages(id,ticket_id,author_type,body,created_at) VALUES ('M2','T','customer','답장','2026-10-06T02:00:00Z')"],
 ['new admin message',"INSERT INTO repair_ticket_messages(id,ticket_id,author_type,body,created_at) VALUES ('M2','T','admin','추가','2026-10-07T00:00:00Z')"],
 ['non KR',"UPDATE repair_requests SET country_code='OTHER'"],
 ['no phone',"UPDATE repair_requests SET phone=''"],
]) test(`does not enqueue when ${name}`,async t=>{const {env,db}=setup(t);db.db.exec(sql);assert.equal((await enqueueRepairReminders(env,{now})).queued,0);});
for(const [name,sql] of [
 ['read',"UPDATE repair_ticket_messages SET read_at='2026-10-07T00:00:00Z'"],
 ['closed',"UPDATE repair_tickets SET status='closed'"],
 ['customer reply',"INSERT INTO repair_ticket_messages(id,ticket_id,author_type,body,created_at) VALUES ('M2','T','customer','답장','2026-10-07T00:00:00Z')"],
 ['template disabled',"UPDATE notification_templates SET is_enabled=0 WHERE template_key='ticket.unread_reminder'"],
]) test(`rechecks ${name} immediately before sending`,async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});db.db.exec(sql);
 await dispatch(env,db,{fetchImpl:()=>{throw Error('must not send');}});
 assert.equal(reminder(db),null);assert.equal(db.prepare('SELECT * FROM repair_ticket_reminders').first(),null);
});
test('system status message does not replace an unread administrator conversation',async t=>{
 const {env,db}=setup(t);db.db.exec("INSERT INTO repair_ticket_messages(id,ticket_id,author_type,body,created_at) VALUES ('M2','T','system','상태','2026-10-07T00:00:00Z')");
 assert.equal((await enqueueRepairReminders(env,{now})).queued,1);
});
test('pending reminder defers after 21:00 without consuming its one attempt',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});
 await dispatch(env,db,{now:new Date('2026-10-07T12:00:00Z'),fetchImpl:()=>{throw Error('must not send');}});
 assert.equal(reminder(db).available_at,'2026-10-08T00:00:00.000Z');assert.equal(reminder(db).attempts,0);
 assert.equal(db.prepare('SELECT attempted_at FROM repair_ticket_reminders').first().attempted_at,null);
});
test('disabled SMS or dry run does not consume the one reminder',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});env.SMS_DRY_RUN='true';await dispatch(env,db);
 assert.equal(reminder(db).status,'pending');assert.equal(reminder(db).attempts,0);
});
test('network ambiguity makes reminder unknown, alerts once, and prohibits manual/automatic retries',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});let count=0;
 await dispatch(env,db,{fetchImpl:async()=>{count++;throw Error('network error');}});
 assert.equal(count,1);assert.equal(reminder(db).status,'unknown');
 await dispatch(env,db);assert.equal(count,1);
 await assert.rejects(createManualNotificationRetry(env,reminder(db).id),/티켓당 1회/);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE template_key='notification.delivery_failed_admin'").first().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE channel='email' AND template_key='ticket.unread_reminder'").first().n,0);
});
test('stale SMS claim is not replayed after a crashed worker',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});db.prepare("UPDATE notification_outbox SET status='processing',locked_at='2026-10-06T01:00:00.000Z'").run();
 await dispatch(env,db,{fetchImpl:()=>{throw Error('must not send');}});assert.equal(reminder(db).status,'unknown');
});
test('reminder can be activated with all other additional SMS disabled',async t=>{
 const {env}=setup(t);await activateNotificationDraft(env,{templateKey:'ticket.unread_reminder',channel:'sms'});
});
test('failure alerts are durable, deduplicated, masked and non-recursive',async t=>{
 const {env,db}=setup(t);const failure={sourceKey:'notification_outbox:test',templateKey:'shop.order_completed',recipient:'customer@example.com',channel:'email',error:'provider error'};
 await Promise.all([reportNotificationFailure(env,failure),reportNotificationFailure(env,failure)]);
 const alert=db.prepare("SELECT * FROM notification_outbox").first();assert.equal(alert.recipient,'admin@example.com');assert.match(alert.body_text,/cu\*\*\*@example.com/);
 await reportNotificationFailure(env,{...failure,sourceKey:'alert',templateKey:'notification.delivery_failed_admin'});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,1);
 db.prepare('DELETE FROM notification_outbox').run();await reportNotificationFailure(env,failure);assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,0);
});
test('direct authentication/workshop/cancellation failure is recorded without message contents',async t=>{
 const {env,db}=setup(t);await assert.rejects(monitorDirectEmail(env,{sourceKey:'auth:1',templateKey:'auth.signup',recipient:'c@example.com'},()=>{throw Error('Email service unavailable');}),/unavailable/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,1);
});
test('SOLAPI HTTP success with a registration rejection is a failure',async t=>{
 const {env}=setup(t);const outcome=await sendSolapiNotification(env,{recipient:'01012345678',body_text:'test'},async()=>Response.json({groupInfo:{count:{registeredFailed:1}},failedMessageList:[{statusMessage:'등록되지 않은 발신번호'}]}));
 assert.equal(outcome.disposition,'failed');assert.match(outcome.error,/발신번호/);
});
test('migration is rerunnable and preserves the durable once-only ledger',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});await dispatch(env,db);
 const migration=readFileSync(new URL('../cloudflare/d1/migrations/0043_repair_reminders_and_failure_alerts.sql',import.meta.url),'utf8');db.db.exec(migration);db.db.exec(migration);
 assert.equal((await enqueueRepairReminders(env,{now})).queued,0);
});

test('accepted SMS is final and does not create a delivery lookup job',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});await dispatch(env,db);
 assert.equal(reminder(db).status,'sent');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_deliveries WHERE channel='sms'").first().n,0);
});
test('legacy SMS delivery jobs close as accepted without a provider lookup',async t=>{
 const {reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);
 db.prepare(`INSERT INTO notification_deliveries(channel,provider_id,source_key,template_key,recipient,status,created_at,next_check_at)
   VALUES ('sms','G-legacy','notification_outbox:legacy','repair.completed','01012345678','pending',?,?)`).bind(now.toISOString(),now.toISOString()).run();
 const result=await reconcileNotificationDeliveries(env,{now,fetchImpl:()=>{throw Error('must not fetch');}});
 assert.equal(result.accepted,1);assert.equal(db.prepare("SELECT status FROM notification_deliveries WHERE channel='sms'").first().status,'accepted');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE template_key='notification.delivery_failed_admin'").first().n,0);
});
test('direct email bounce is monitored without saving the email body',async t=>{
 const {trackDirectEmailResponse,reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);await trackDirectEmailResponse(env,Response.json({id:'email-1'}),'auth.signup','customer@example.com');
 db.prepare("UPDATE notification_deliveries SET next_check_at=?").bind(now.toISOString()).run();
 await reconcileNotificationDeliveries(env,{now,fetchImpl:async()=>Response.json({last_event:'bounced'})});
 assert.equal(db.prepare('SELECT status FROM notification_deliveries').first().status,'failed');
 assert.match(db.prepare('SELECT body_text FROM notification_outbox').first().body_text,/bounced/);
});
test('email delivery lookup uses the dedicated monitor key',async t=>{
 const {trackDirectEmailResponse,reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);await trackDirectEmailResponse(env,Response.json({id:'email-key'}),'auth.signup','customer@example.com');
 db.prepare("UPDATE notification_deliveries SET next_check_at=?").bind(now.toISOString()).run();
 await reconcileNotificationDeliveries(env,{now,fetchImpl:async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer monitor-key');return Response.json({last_event:'delivered'});}});
 assert.equal(db.prepare('SELECT status FROM notification_deliveries').first().status,'delivered');
});
test('email sends are not enrolled in delivery monitoring without a monitor key',async t=>{
 const {trackDirectEmailResponse}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);delete env.RESEND_MONITOR_API_KEY;
 await trackDirectEmailResponse(env,Response.json({id:'email-unmonitored'}),'auth.signup','customer@example.com');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_deliveries').first().n,0);
});
test('legacy pending email is closed without an alert when monitoring is not configured',async t=>{
 const {trackDirectEmailResponse,reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);await trackDirectEmailResponse(env,Response.json({id:'email-legacy'}),'auth.signup','customer@example.com');
 delete env.RESEND_MONITOR_API_KEY;db.prepare("UPDATE notification_deliveries SET next_check_at=?").bind(now.toISOString()).run();
 const result=await reconcileNotificationDeliveries(env,{now,fetchImpl:()=>{throw Error('must not fetch');}});
 assert.equal(result.unmonitored,1);assert.equal(db.prepare('SELECT status FROM notification_deliveries').first().status,'unmonitored');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE template_key='notification.delivery_failed_admin'").first().n,0);
});
test('monitor permission errors are not described as customer message failures',async t=>{
 const {trackDirectEmailResponse,reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);await trackDirectEmailResponse(env,Response.json({id:'email-forbidden'}),'auth.signup','customer@example.com');
 db.prepare("UPDATE notification_deliveries SET next_check_at=?").bind(now.toISOString()).run();
 const result=await reconcileNotificationDeliveries(env,{now,fetchImpl:async()=>new Response('',{status:401})});
 const alert=db.prepare("SELECT subject,body_text FROM notification_outbox WHERE template_key='notification.delivery_failed_admin'").first();
 assert.equal(result.unmonitored,1);assert.equal(db.prepare('SELECT status FROM notification_deliveries').first().status,'unmonitored');
 assert.match(alert.subject,/전달 상태 확인 실패/);assert.doesNotMatch(alert.subject,/메시지 발송 실패/);
 assert.match(alert.body_text,/발송 요청은 공급자에게 정상 접수/);
});
test('delivery API rate limits retry only the lookup, never the customer send',async t=>{
 const {trackDirectEmailResponse,reconcileNotificationDeliveries}=await import('../cloudflare/lib/notification-delivery.js');
 const {env,db}=setup(t);await trackDirectEmailResponse(env,Response.json({id:'email-1'}),'auth.signup','customer@example.com');
 db.prepare("UPDATE notification_deliveries SET next_check_at=?,created_at=?").bind(now.toISOString(),now.toISOString()).run();
 await reconcileNotificationDeliveries(env,{now,fetchImpl:async()=>new Response('',{status:429})});
 assert.equal(db.prepare('SELECT status FROM notification_deliveries').first().status,'pending');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,0);
});
test('unreported failure is recovered after an interrupted processor, but historical failures are excluded',async t=>{
 const {env,db}=setup(t);await enqueueRepairReminders(env,{now});db.prepare("UPDATE notification_outbox SET status='failed',last_error='failed',updated_at='2020-01-01T00:00:00.000Z'").run();
 await reconcileNotificationFailures(env);assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,1);
 db.prepare("UPDATE notification_outbox SET updated_at='2099-01-01T00:00:00.000Z'").run();
 await reconcileNotificationFailures(env);await reconcileNotificationFailures(env);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,2);
});
test('admin alert retries a mail outage without recursively creating alerts',async t=>{
 const {env,db}=setup(t);await reportNotificationFailure(env,{sourceKey:'direct:test',templateKey:'auth.login',channel:'email',recipient:'c@example.com',error:'error'});
 const alert=db.prepare('SELECT * FROM notification_outbox').first();
 await processNotificationOutbox(env,{ids:[alert.id],now:new Date('2099-01-01T01:00:00Z'),fetchImpl:async()=>Response.json({message:'temporary mail outage'},{status:503})});
 assert.equal(db.prepare('SELECT status FROM notification_outbox').first().status,'pending');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_outbox').first().n,1);
});
