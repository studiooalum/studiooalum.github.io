export async function readUnavailableEditions(env) {
  if (!env.OALUM_DB) throw Object.assign(new Error('재고를 확인할 수 없습니다.'), {status:503});
  const rows = await env.OALUM_DB.prepare('SELECT DISTINCT product_id FROM edition_claims').all();
  return (rows.results || []).map(row => row.product_id);
}

export async function assertEditionAvailability(env, items) {
  if (items.some(item => Number(item.qty) !== 1)) throw Object.assign(new Error('에디션은 한 점만 구매할 수 있습니다.'), {status:409});
  const sold = new Set(await readUnavailableEditions(env));
  if (items.some(item => sold.has(item.productId || item._id || item.lineId))) {
    throw Object.assign(new Error('이미 판매되었거나 결제 확인 중인 에디션입니다. 장바구니를 확인해주세요.'), {status:409});
  }
}

// Re-check manual stops immediately before the first approval attempt.
// Existing in-flight approvals must instead reconcile their original payment.
export async function assertManualEditionAvailability(env, orderId) {
  const rows=await env.OALUM_DB.prepare("SELECT COALESCE(NULLIF(product_id,''),line_id) AS id FROM order_items WHERE order_id=?").bind(orderId).all();
  const ids=(rows.results||[]).map(row=>row.id);
  const project=env.SANITY_PROJECT_ID || '9bsud0bl',dataset=env.SANITY_DATASET || 'production';
  if(!/^[a-z0-9-]+$/.test(project) || !/^[a-zA-Z0-9_-]+$/.test(dataset)) throw Object.assign(new Error('상품 저장소 설정을 확인해주세요.'),{status:503});
  const url=new URL(`https://${project}.api.sanity.io/v2023-01-01/data/query/${dataset}`);
  url.searchParams.set('query','*[_type == "product" && !(_id in path("drafts.**")) && _id in $ids]{_id,soldOut}');
  url.searchParams.set('$ids',JSON.stringify(ids));
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok || !Array.isArray(payload?.result)) throw Object.assign(new Error('상품 판매 상태를 확인하지 못했습니다. 다시 시도해주세요.'),{status:503});
  const available=new Set(payload.result.filter(product=>!product.soldOut).map(product=>product._id));
  if(!ids.length || ids.some(id=>!available.has(id))) throw Object.assign(new Error('판매가 중지된 에디션이 있습니다. 장바구니를 확인해주세요.'),{status:409});
}
