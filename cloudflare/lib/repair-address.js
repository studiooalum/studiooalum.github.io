const EXPLICIT_KOREA_MARKER = /(?:^|[^A-Za-z가-힣])(?:대한민국|한국)(?=$|[^A-Za-z가-힣])|(?:^|[^A-Za-z])(?:south\s+korea|republic\s+of\s+korea)(?=$|[^A-Za-z])/i;
const KOREAN_REGION_MARKER = /(?:서울(?:특별)?시|부산(?:광역)?시|대구(?:광역)?시|인천(?:광역)?시|광주(?:광역)?시|대전(?:광역)?시|울산(?:광역)?시|세종(?:특별자치)?시|경기도|강원(?:특별자치)?도|충청북도|충청남도|전북(?:특별자치)?도|전라북도|전라남도|경상북도|경상남도|제주(?:특별자치)?도)(?=$|[\s,])/;

export function normalizeRepairShippingAddress(value) {
  return String(value || "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .slice(0, 500);
}

export function inferRepairCountryCode({ shippingAddress = "" } = {}) {
  const address = normalizeRepairShippingAddress(shippingAddress);
  if (EXPLICIT_KOREA_MARKER.test(address) || KOREAN_REGION_MARKER.test(address)) return "KR";
  return "OTHER";
}
