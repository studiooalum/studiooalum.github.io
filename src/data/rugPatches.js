export const rugPatches = [
  // 1. 단색 원단
  {
    id: "patch-01",
    kind: "solid",
    color: "#EAE7DE",
    span: 1,
    height: 1
  },

  // 2. 상품 (Sanity 주입 대상)
  {
    id: "patch-02",
    kind: "product",
    span: 2,
    height: 2,
    productData: {
      title: "(Sanity) Patchwork gloves",
      slug: { current: "patchwork-gloves" },
      price: null,
      category: "gloves",
      soldOut: false,
      image: "",
      description: "이 영역은 Sanity 상품 데이터로 대체될 수 있습니다."
    }
  },

  // 3. 패턴
  {
    id: "patch-03",
    kind: "pattern",
    patternType: "denim",
    span: 1,
    height: 2
  },

  // 4. 단색
  {
    id: "patch-04",
    kind: "solid",
    color: "#5C5C5C",
    span: 1,
    height: 1
  },

  // 5. 상품
  {
    id: "patch-05",
    kind: "product",
    span: 1,
    height: 1,
    productData: {
      title: "Vintage Patch Keyring",
      slug: { current: "vintage-patch-keyring" },
      price: 32000,
      category: "accessory",
      soldOut: true,
      image: "/images/prod-keyring-embroidery.png",
      description: "빈티지 원단을 활용한 키링입니다."
    }
  },

  // 6. 패턴
  {
    id: "patch-06",
    kind: "pattern",
    patternType: "checkered",
    span: 2,
    height: 1
  }
];

/**
 * Sanity 데이터로 특정 패치를 상품 패치로 교체
 */
export function setProductPatch(index, productData) {
  if (index >= 0 && index < rugPatches.length) {
    rugPatches[index] = {
      ...rugPatches[index], // 기존 span/height 유지 가능
      kind: "product",
      productData
    };
  }
}
