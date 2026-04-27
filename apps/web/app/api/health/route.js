export function GET() {
  return Response.json({
    ok: true,
    app: "apps/web",
    routes: {
      storefront: true,
      orders: "stub",
      paymentConfirm: "stub",
    },
    checkedAt: new Date().toISOString(),
  });
}