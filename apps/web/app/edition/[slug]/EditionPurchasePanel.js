"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCartItem } from "@/lib/cart-storage";
import { formatPrice } from "@/lib/catalog";

export default function EditionPurchasePanel({ product }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function commitItem() {
    addCartItem({
      ...product,
      qty: 1,
    });
  }

  function handleAddToCart() {
    commitItem();
    setNotice("장바구니에 담았습니다.");
  }

  function handleBuyNow() {
    commitItem();
    setNotice("");
    startTransition(() => {
      router.push("/checkout");
    });
  }

  return (
    <div className="purchase-panel">
      <p className="detail-kicker">Commerce actions</p>
      <p className="purchase-panel__price">{formatPrice(product.price)}</p>
      <div className="purchase-panel__actions">
        <button
          type="button"
          className="action-button action-button--ghost"
          onClick={handleAddToCart}
          disabled={product.soldOut || isPending}
        >
          Add to cart
        </button>
        <button
          type="button"
          className="action-button action-button--solid"
          onClick={handleBuyNow}
          disabled={product.soldOut || isPending}
        >
          Checkout now
        </button>
      </div>
      <p className="purchase-panel__note">
        {product.soldOut
          ? "판매 완료된 에디션입니다."
          : "체크아웃으로 이동하면 apps/web 의 주문 생성 API 를 먼저 호출합니다."}
      </p>
      {notice ? <p className="purchase-panel__notice">{notice}</p> : null}
    </div>
  );
}