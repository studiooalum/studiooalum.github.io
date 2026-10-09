export async function applyInventory(products) {
  const response = await fetch('/api/shop/inventory', {cache:'no-store'});
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('재고 확인 중입니다. 잠시 후 새로고침해주세요.');
  const unavailable = new Set(data.unavailable);
  return products.map(product => product && ({...product, manualSoldOut:!!product.soldOut, soldOut:!!product.soldOut || unavailable.has(product._id)}));
}
