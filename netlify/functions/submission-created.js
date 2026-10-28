// Runs on Netlify every time the order form is submitted.
// - Custom Film (quote request): emails both sides straight away.
// - Memory / Family Film: saves the order and waits. It is only sent off
//   once Stripe confirms payment (see stripe-webhook.js).
//
// Netlify environment variables needed:
//   GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_TO (see netlify/lib/orders.js)

const { getStore, connectLambda } = require("@netlify/blobs");
const { fileUrl, sendOrderEmails } = require("../lib/orders.js");

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    console.error("Bad payload", e);
    return { statusCode: 400, body: "Bad payload" };
  }
  if (!payload || payload.form_name !== "order") return { statusCode: 200, body: "Not an order" };

  const d = payload.data || {};
  const photos = [];
  for (let i = 1; i <= 15; i++) {
    const u = fileUrl(d["photo" + i]);
    if (u) photos.push(u);
  }
  const ref = String(d["order-ref"] || payload.id || Date.now()).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  if (/^Custom/.test(d.plan || "")) {
    await sendOrderEmails({ d, photos, ref, paid: false });
    return { statusCode: 200, body: "Quote request sent" };
  }

  // Paid film: hold the order until Stripe says it's paid
  connectLambda(event);
  const store = getStore("orders");
  await store.setJSON(ref, { d, photos, ref, status: "awaiting payment", created: new Date().toISOString() });
  console.log("Order saved, awaiting payment:", ref);
  return { statusCode: 200, body: "Saved" };
};
