import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium }=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base='http://127.0.0.1:4183';
const output='test-results/shop-returns';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const product={_id:'fixture-edition',title:'Patchwork Beanie (#Black 01)',slug:{current:'fixture-edition'},price:43000,shopTags:['hat'],images:[],soldOut:false};
  let unavailable=['fixture-edition'],submitted=null,decision=null;
  const request={id:'RET_FIXTURE',status:'pending',label:'검토 대기',reasonCode:'change_of_mind',reasonNote:'착용감이 맞지 않습니다.',shippingFee:0,decisionNote:''};
  const order={orderId:'OALUM-CF-BROWSER',orderName:'Studio OALUM · Patchwork Beanie (#Black 01)',createdAt:new Date().toISOString(),status:'paid',paymentStatus:'confirmed',totalAmount:47000,
   customer:{name:'테스트 고객',email:'test@example.com'},shipping:{zipcode:'01234',address1:'테스트 주소'},shipment:{status:'shipped',shippedAt:new Date().toISOString()},items:[{title:product.title,quantity:1}],returnRequest:request,
   cancellation:{available:true,action:'request_approval',buttonLabel:'반품·환불 요청',message:'사유를 선택해주세요.'}};
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   let data={ok:true};
   if(path==='/api/sanity/query') data.result=route.request().postDataJSON().query.includes('slug.current == $slug')?product:[product];
   else if(path==='/api/shop/inventory') data.unavailable=unavailable;
   else if(path==='/api/auth/account') data.account={user:{fullName:'테스트 고객',email:'test@example.com'},orders:[order],workshopReservations:[],repairRequests:[]};
   else if(path==='/api/auth/orders/cancel') {submitted=route.request().postDataJSON();data.message='반품·환불 요청을 접수했습니다.';order.cancellation={available:false,message:'검토 대기'};}
   else if(path==='/api/orders/admin-session') data={ok:true,accessToken:'fixture-admin',expiresAt:new Date(Date.now()+3600000).toISOString()};
   else if(path==='/api/orders/fulfillment') data={ok:true,orders:[order],order,config:{deliveryTracker:{enabled:false}}};
   else if(path==='/api/orders/returns') {
    if(route.request().method()==='POST') {decision=route.request().postDataJSON();request.status='awaiting_return';request.label='반품 회수 대기';request.decisionNote=decision.note;}
    data={ok:true,requests:[{...request,orderId:order.orderId}]};
   }
   await route.fulfill({json:data});
  });
  await page.goto(base+'/product.html?product=Patchwork%20Beanie');
  await page.locator('.edition-card.is-sold').waitFor();
  assert.equal(await page.locator('.edition-card.is-sold img').count(),0);
  await page.goto(base+'/edition.html?slug=fixture-edition');
  await page.locator('body.is-sold').waitFor();
  assert.equal(await page.locator('#buyNowBtn').isVisible(),false);
  unavailable=[];
  await page.reload();await page.locator('#buyNowBtn').waitFor();
  assert.equal(await page.locator('body.is-sold').count(),0);
  await page.goto(base+'/account.html?view=orders');
  await page.locator('[data-account-cancel]').first().click();
  await page.locator('dialog select').selectOption('other');
  await page.locator('dialog textarea').fill('사용 일정이 변경되어 반품을 요청합니다.');
  await page.screenshot({path:`${output}/customer-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'요청 내용 확인'}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog'));
  await page.getByText('검토 대기',{exact:true}).first().waitFor();
  assert.equal(submitted.reasonCode,'other');assert.match(submitted.reason,/사용 일정/);
  await page.goto(base+'/admin.html?orderId=OALUM-CF-BROWSER');
  await page.locator('[name=adminSecret]').fill('fixture');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.locator('[data-return-id]').waitFor();
  await page.locator('[data-return-note]').fill('반품 주소와 회수 방법을 안내드립니다.');
  await page.locator('[data-return-action=approve]').click();
  await page.locator('[data-return-received]').waitFor();
  assert.equal(decision.action,'approve');assert.equal(decision.shippingFee,0);
  assert.equal(await page.locator('[data-return-fee]').count(),0);
  assert.match(await page.locator('[data-return-id]').textContent(),/47,000/);
  await page.screenshot({path:`${output}/admin-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'admin horizontal overflow');
  assert.deepEqual(errors,[]);
  await context.close();console.log(`Customer reason entry, administrator approval and inventory recovery passed at ${width}px.`);
 }
} finally {await browser.close();}
