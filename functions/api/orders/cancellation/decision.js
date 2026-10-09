// Pending legacy requests are migrated to the authenticated returns dashboard.
export function onRequestGet(context) {
  return Response.redirect(new URL('/admin',context.request.url).href,303);
}
export function onRequestPost() {
  return new Response('관리자 주문 화면에 로그인하여 반품·환불 요청을 처리해주세요.',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
