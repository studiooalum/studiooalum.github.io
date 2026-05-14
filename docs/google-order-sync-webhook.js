const ORDERS_SHEET_NAME = "Orders";
const EVENTS_SHEET_NAME = "OrderEvents";

const ORDER_HEADERS = [
  "Last Synced At",
  "Event Type",
  "Sync Source",
  "Order ID",
  "Order Name",
  "Order Status",
  "Payment Status",
  "Total Amount",
  "Currency",
  "Customer Name",
  "Customer Phone",
  "Customer Email",
  "Zipcode",
  "Address 1",
  "Address 2",
  "Note",
  "Item Count",
  "Items Summary",
  "Payment Key",
  "Payment Method",
  "Payment Provider Mode",
  "Approved At",
  "Cancelled At",
  "Created At",
  "Updated At",
  "Raw JSON",
  "Last Emailed Key",
];

const EVENT_HEADERS = [
  "Received At",
  "Event Type",
  "Order ID",
  "Order Name",
  "Order Status",
  "Payment Status",
  "Payment Key",
  "Total Amount",
  "Customer Name",
  "Customer Email",
  "Send Email",
  "Email Key",
  "Sync Source",
  "Delivery ID",
  "Raw JSON",
];

function doPost(e) {
  try {
    const envelope = parseEnvelope_(e);
    verifyEnvelope_(envelope);

    const event = JSON.parse(envelope.payload);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error("Bind this Apps Script to the target Google Sheet before deploying it as a web app.");
    }

    const ordersSheet = getOrCreateSheet_(spreadsheet, ORDERS_SHEET_NAME, ORDER_HEADERS);
    const eventsSheet = getOrCreateSheet_(spreadsheet, EVENTS_SHEET_NAME, EVENT_HEADERS);
    const orderRow = buildOrderRow_(event);
    const eventRow = buildEventRow_(event);
    const orderRowIndex = upsertOrderRow_(ordersSheet, orderRow);

    appendRow_(eventsSheet, EVENT_HEADERS, eventRow);

    const emailed = maybeSendNotificationEmail_(ordersSheet, orderRowIndex, event);

    return jsonResponse_({
      ok: true,
      orderId: orderRow["Order ID"],
      emailed,
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function parseEnvelope_(e) {
  const body = (e && e.postData && e.postData.contents) || "{}";
  const envelope = JSON.parse(body);
  const payload = String(envelope.payload || "").trim();

  if (!payload) {
    throw new Error("Missing payload.");
  }

  return {
    payload,
    timestamp: String(envelope.timestamp || "").trim(),
    signature: String(envelope.signature || "").trim(),
  };
}

function verifyEnvelope_(envelope) {
  const secret = String(PropertiesService.getScriptProperties().getProperty("ORDER_SYNC_SHARED_SECRET") || "").trim();

  if (!secret) {
    return;
  }

  if (!envelope.timestamp || !envelope.signature) {
    throw new Error("Missing signature.");
  }

  const timestampMs = new Date(envelope.timestamp).getTime();
  const ageMs = Math.abs(Date.now() - timestampMs);

  if (!isFinite(timestampMs) || ageMs > 10 * 60 * 1000) {
    throw new Error("Request timestamp is invalid or expired.");
  }

  const expected = computeHmacHex_(secret, `${envelope.timestamp}.${envelope.payload}`);
  if (expected !== envelope.signature) {
    throw new Error("Invalid signature.");
  }
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const shouldReset = headers.some(function (header, index) {
    return String(currentHeaders[index] || "").trim() !== header;
  });

  if (shouldReset) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function buildOrderRow_(event) {
  const order = event.order || {};
  const customer = order.customer || {};
  const shipping = order.shipping || {};
  const payment = order.payment || {};

  return {
    "Last Synced At": event.sentAt || new Date().toISOString(),
    "Event Type": event.eventType || "order.updated",
    "Sync Source": getMetaValue_(event, "syncSource"),
    "Order ID": order.orderId || "",
    "Order Name": order.orderName || "",
    "Order Status": order.status || "",
    "Payment Status": order.paymentStatus || "",
    "Total Amount": order.totalAmount || "",
    "Currency": order.currency || "KRW",
    "Customer Name": customer.name || "",
    "Customer Phone": customer.phone || "",
    "Customer Email": customer.email || "",
    "Zipcode": shipping.zipcode || "",
    "Address 1": shipping.address1 || "",
    "Address 2": shipping.address2 || "",
    "Note": shipping.note || "",
    "Item Count": order.itemCount || 0,
    "Items Summary": summarizeItems_(order.items || []),
    "Payment Key": payment.paymentKey || order.activePaymentKey || "",
    "Payment Method": payment.method || "",
    "Payment Provider Mode": payment.providerMode || getMetaValue_(event, "providerMode"),
    "Approved At": payment.approvedAt || order.paidAt || "",
    "Cancelled At": payment.cancelledAt || order.cancelledAt || "",
    "Created At": order.createdAt || "",
    "Updated At": order.updatedAt || "",
    "Raw JSON": JSON.stringify(event),
    "Last Emailed Key": "",
  };
}

function buildEventRow_(event) {
  const order = event.order || {};
  const customer = order.customer || {};
  const payment = order.payment || {};

  return {
    "Received At": event.sentAt || new Date().toISOString(),
    "Event Type": event.eventType || "order.updated",
    "Order ID": order.orderId || "",
    "Order Name": order.orderName || "",
    "Order Status": order.status || "",
    "Payment Status": order.paymentStatus || "",
    "Payment Key": payment.paymentKey || order.activePaymentKey || "",
    "Total Amount": order.totalAmount || "",
    "Customer Name": customer.name || "",
    "Customer Email": customer.email || "",
    "Send Email": getMetaValue_(event, "sendEmail") ? "yes" : "no",
    "Email Key": getMetaValue_(event, "emailKey"),
    "Sync Source": getMetaValue_(event, "syncSource"),
    "Delivery ID": getMetaValue_(event, "deliveryId"),
    "Raw JSON": JSON.stringify(event),
  };
}

function upsertOrderRow_(sheet, row) {
  const orderId = String(row["Order ID"] || "").trim();
  if (!orderId) {
    throw new Error("Missing order ID.");
  }

  const headerMap = getHeaderMap_(ORDER_HEADERS);
  const existingRow = findOrderRow_(sheet, orderId, headerMap["Order ID"]);

  if (existingRow > 0) {
    row["Last Emailed Key"] = sheet.getRange(existingRow, headerMap["Last Emailed Key"]).getValue();
    sheet.getRange(existingRow, 1, 1, ORDER_HEADERS.length).setValues([toRowValues_(ORDER_HEADERS, row)]);
    return existingRow;
  }

  appendRow_(sheet, ORDER_HEADERS, row);
  return sheet.getLastRow();
}

function findOrderRow_(sheet, orderId, orderIdColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  const values = sheet.getRange(2, orderIdColumn, lastRow - 1, 1).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim() === orderId) {
      return index + 2;
    }
  }

  return 0;
}

function appendRow_(sheet, headers, row) {
  sheet.appendRow(toRowValues_(headers, row));
}

function toRowValues_(headers, row) {
  return headers.map(function (header) {
    const value = row[header];
    return value == null ? "" : value;
  });
}

function getHeaderMap_(headers) {
  return headers.reduce(function (map, header, index) {
    map[header] = index + 1;
    return map;
  }, {});
}

function maybeSendNotificationEmail_(ordersSheet, orderRowIndex, event) {
  const sendEmail = Boolean(getMetaValue_(event, "sendEmail"));
  if (!sendEmail) {
    return false;
  }

  const recipients = getNotificationRecipients_(event);
  if (!recipients.length) {
    return false;
  }

  const emailKey = String(getMetaValue_(event, "emailKey") || "").trim();
  const headerMap = getHeaderMap_(ORDER_HEADERS);
  const lastEmailedKey = String(ordersSheet.getRange(orderRowIndex, headerMap["Last Emailed Key"]).getValue() || "").trim();

  if (emailKey && lastEmailedKey === emailKey) {
    return false;
  }

  const subject = buildEmailSubject_(event);
  const textBody = buildEmailTextBody_(event);
  const htmlBody = buildEmailHtmlBody_(event);

  MailApp.sendEmail({
    to: recipients.join(","),
    subject: subject,
    body: textBody,
    htmlBody: htmlBody,
  });

  if (emailKey) {
    ordersSheet.getRange(orderRowIndex, headerMap["Last Emailed Key"]).setValue(emailKey);
  }

  return true;
}

function getNotificationRecipients_(event) {
  const fromScript = parseEmailList_(PropertiesService.getScriptProperties().getProperty("ORDER_NOTIFICATION_EMAILS"));
  const fromEvent = Array.isArray(event.notificationEmails) ? event.notificationEmails : [];

  return uniqueValues_(fromScript.concat(fromEvent).map(function (entry) {
    return String(entry || "").trim();
  }).filter(Boolean));
}

function buildEmailSubject_(event) {
  const order = event.order || {};
  return `[OALUM] ${getEventLabel_(event.eventType)} - ${order.orderName || order.orderId || "주문"}`;
}

function buildEmailTextBody_(event) {
  const order = event.order || {};
  const customer = order.customer || {};
  const payment = order.payment || {};
  const shipping = order.shipping || {};

  return [
    `[OALUM] ${getEventLabel_(event.eventType)}`,
    `주문번호: ${order.orderId || "-"}`,
    `주문명: ${order.orderName || "-"}`,
    `주문상태: ${order.status || "-"}`,
    `결제상태: ${order.paymentStatus || "-"}`,
    `결제키: ${payment.paymentKey || order.activePaymentKey || "-"}`,
    `결제수단: ${payment.method || "-"}`,
    `총금액: ${formatMoney_(order.totalAmount, order.currency)}`,
    `고객명: ${customer.name || "-"}`,
    `이메일: ${customer.email || "-"}`,
    `연락처: ${customer.phone || "-"}`,
    `배송지: ${shipping.zipcode || ""} ${shipping.address1 || ""} ${shipping.address2 || ""}`.trim() || "-",
    `메모: ${shipping.note || "-"}`,
    `상품: ${summarizeItems_(order.items || []) || "-"}`,
    `동기화시각: ${event.sentAt || new Date().toISOString()}`,
  ].join("\n");
}

function buildEmailHtmlBody_(event) {
  const order = event.order || {};
  const customer = order.customer || {};
  const payment = order.payment || {};
  const shipping = order.shipping || {};
  const rows = [
    ["주문번호", order.orderId || "-"],
    ["주문명", order.orderName || "-"],
    ["주문상태", order.status || "-"],
    ["결제상태", order.paymentStatus || "-"],
    ["결제키", payment.paymentKey || order.activePaymentKey || "-"],
    ["결제수단", payment.method || "-"],
    ["총금액", formatMoney_(order.totalAmount, order.currency)],
    ["고객명", customer.name || "-"],
    ["이메일", customer.email || "-"],
    ["연락처", customer.phone || "-"],
    ["배송지", `${shipping.zipcode || ""} ${shipping.address1 || ""} ${shipping.address2 || ""}`.trim() || "-"],
    ["메모", shipping.note || "-"],
    ["상품", summarizeItems_(order.items || []) || "-"],
    ["동기화시각", event.sentAt || new Date().toISOString()],
  ];

  const tableRows = rows.map(function (row) {
    return `<tr><th style="text-align:left;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${escapeHtml_(row[0])}</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml_(row[1])}</td></tr>`;
  }).join("");

  return [
    `<h2 style="font-family:Arial,sans-serif;">[OALUM] ${escapeHtml_(getEventLabel_(event.eventType))}</h2>`,
    `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${tableRows}</table>`,
  ].join("");
}

function summarizeItems_(items) {
  return (items || []).map(function (item) {
    const title = item.title || "상품";
    const quantity = item.quantity != null ? item.quantity : item.qty;
    const amount = item.unitPrice != null ? item.unitPrice : item.price;
    return `${title} x${quantity || 0} (${formatMoney_(amount, "KRW")})`;
  }).join(", ");
}

function getEventLabel_(eventType) {
  switch (String(eventType || "")) {
    case "order.created":
      return "신규 주문 생성";
    case "payment.confirmed":
      return "결제 완료";
    case "payment.failed":
      return "결제 실패";
    case "payment.cancelled":
      return "결제 취소";
    case "payment.refunded":
      return "환불 처리";
    case "payment.authorized":
      return "결제 승인 대기";
    case "payment.pending":
      return "결제 진행 중";
    default:
      return "주문 업데이트";
  }
}

function formatMoney_(value, currency) {
  const amount = Number(value || 0);
  if (!amount) {
    return `0 ${currency || "KRW"}`;
  }

  return `${amount.toLocaleString("ko-KR")} ${currency || "KRW"}`;
}

function parseEmailList_(value) {
  return uniqueValues_(String(value || "").split(/[\n,;]/).map(function (entry) {
    return entry.trim();
  }).filter(Boolean));
}

function uniqueValues_(values) {
  const seen = {};
  return values.filter(function (entry) {
    if (seen[entry]) {
      return false;
    }

    seen[entry] = true;
    return true;
  });
}

function getMetaValue_(event, key) {
  return event && event.meta ? event.meta[key] : null;
}

function computeHmacHex_(secret, value) {
  return Utilities.computeHmacSha256Signature(value, secret).map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return (`0${normalized.toString(16)}`).slice(-2);
  }).join("");
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}