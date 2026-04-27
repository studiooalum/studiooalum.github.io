import Link from "next/link";

export default async function FailPage({ searchParams }) {
  const params = await searchParams;

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <div className="detail-copy">
          <p className="kicker">Payment failed</p>
          <h1>승인 단계에서 문제가 발생했습니다.</h1>
          <p className="detail-note">{params?.message || "알 수 없는 오류가 발생했습니다."}</p>
          <div className="action-row">
            <Link href="/checkout" className="action-pill action-pill--solid">
              Back to checkout
            </Link>
            <Link href="/shop" className="action-pill action-pill--ghost">
              Back to shop
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}