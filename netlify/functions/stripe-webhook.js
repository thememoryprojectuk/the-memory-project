// Stripe calls this when a customer finishes paying.
// It finds the saved order by its ref and sends it off (emails both sides).
//
// Netlify environment variable needed:
//   STRIPE_WEBHOOK_SECRET  the "Signing secret" (whsec_...) from the Stripe webhook

const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const { sendOrderEmails } = require("../lib/orders.js");

function verify(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = parts.t;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const header = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!verify(raw, header, process.env.STRIPE_WEBHOOK_SECRET)) {
    console.error("Stripe signature check failed");
    return { statusCode: 400, body: "Bad signature" };
  }

  const evt = JSON.parse(raw);
  if (evt.type !== "checkout.session.completed") return { statusCode: 200, body: "Ignored" };
  const session = evt.data.object;
  if (session.payment_status !== "paid") return { statusCode: 200, body: "Not paid yet" };

  const ref = String(session.client_reference_id || "").toUpperCase();
  connectLambda(event);
  const store = getStore("orders");
  const order = ref ? await store.get(ref, { type: "json" }) : null;

  if (!order) {
    // Paid, but we can't find the form. Still tell the business.
    console.error("Paid but no saved order for ref", ref, session.id);
    const c = session.customer_details || {};
    const d = {
      plan: "UNKNOWN: payment received but no order form found. Contact the customer.",
      name: `${c.name || ""} ${c.email ? "(" + c.email + ")" : ""}`.trim(),
    };
    await sendOrderEmails({ d, photos: [], ref: ref || session.id, paid: true, stripeId: session.id });
    return { statusCode: 200, body: "Paid, order missing" };
  }
  if (order.status === "paid") return { statusCode: 200, body: "Already sent" };

  await sendOrderEmails({ d: order.d, photos: order.photos, ref, paid: true, stripeId: session.payment_intent || session.id });
  await store.setJSON(ref, { ...order, status: "paid", paidAt: new Date().toISOString(), stripe: session.id });
  return { statusCode: 200, body: "Order sent" };
};
