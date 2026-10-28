// Runs automatically on Netlify every time the order form is submitted.
// 1) Emails The Memory Project with the order details and photo links.
// 2) Emails the customer an order confirmation (required by UK consumer law).
//
// Netlify environment variables needed:
//   GMAIL_USER          thememoryproject00@gmail.com
//   GMAIL_APP_PASSWORD  16-character Google app password
//   NOTIFY_TO           where order alerts go (defaults to GMAIL_USER)

const nodemailer = require("nodemailer");

const BUSINESS = {
  name: "The Memory Project",
  legal: "a trading name of Luke Moore and Orlando Moore, trading in partnership",
  address: "8 Knightcott Road, Bristol BS8 3SB, United Kingdom",
  site: "https://thememoryprojectuk.netlify.app",
};

const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fileUrl = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v.startsWith("http") ? v : null;
  return v.url || null;
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const row = (label, value) =>
  value ? `<tr><td style="padding:6px 12px 6px 0;color:#6b5f55;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0">${esc(value)}</td></tr>` : "";

const wrap = (inner) => `<!doctype html><html><body style="margin:0;background:#f7f1e6;font-family:Arial,Helvetica,sans-serif;color:#2b2420">
<div style="max-width:580px;margin:0 auto;padding:28px 20px">
<div style="font-family:Georgia,serif;font-size:22px;margin-bottom:18px">The Memory Project</div>
<div style="background:#fffaf1;border:1px solid #e4d8c6;border-radius:12px;padding:24px;font-size:15px;line-height:1.6">${inner}</div>
<p style="font-size:12px;color:#6b5f55;line-height:1.5;margin-top:18px">${esc(BUSINESS.name)} is ${esc(BUSINESS.legal)}.<br>${esc(BUSINESS.address)}<br><a href="${BUSINESS.site}" style="color:#8a5a3b">${BUSINESS.site.replace("https://", "")}</a></p>
</div></body></html>`;

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
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD not set");
    return { statusCode: 500, body: "Email not configured" };
  }
  const notifyTo = process.env.NOTIFY_TO || user;

  const photos = [];
  for (let i = 1; i <= 15; i++) {
    const u = fileUrl(d["photo" + i]);
    if (u) photos.push(u);
  }
  const occasion = d.occasion === "Something else" && d["occasion-other"] ? d["occasion-other"] : d.occasion;
  const ref = String(payload.id || payload.number || Date.now()).slice(-6).toUpperCase();
  const PAY = {
    memory: "https://buy.stripe.com/6oU9AMe4q8hY3tz2IJeIw00",
    family: "https://buy.stripe.com/00wfZaf8ueGm6FLcjjeIw01",
  };
  const planKey = /^Memory/.test(d.plan || "") ? "memory" : /^Family/.test(d.plan || "") ? "family" : "custom";
  const payLink = PAY[planKey];
  const firstName = String(d.name || "").trim().split(/\s+/)[0] || "there";

  const details =
    row("Order ref", ref) +
    row("Film", d.plan) +
    row("Photos received", String(photos.length)) +
    row("Occasion", occasion) +
    row("Needed by", fmtDate(d["needed-by"])) +
    row("Black and white photos", d["black-and-white"] || "No preference") +
    row("Film title", d["film-title"]) +
    row("Message", d.message) +
    row("Music", d.music || "No preference");

  // ---- 1. Alert to The Memory Project ----
  const photoLinks = photos.length
    ? photos.map((u, i) => `<a href="${esc(u)}" style="color:#8a5a3b">Photo ${i + 1}</a>`).join(" &middot; ")
    : "<em>No photos uploaded</em>";
  const alertHtml = wrap(`
<h2 style="font-family:Georgia,serif;margin:0 0 12px">New order: ${esc(d.plan)}</h2>
<table style="border-collapse:collapse;font-size:15px">
${row("Name", d.name)}${row("Email", d.email)}${details}
</table>
<p style="margin-top:16px"><strong>Photos:</strong><br>${photoLinks}</p>
<p style="font-size:13px;color:#6b5f55">Customer agreed to the Terms, asked you to start straight away, and confirmed photo permission and age 18+.<br>Reply to this email to contact the customer directly.<br><strong>To do:</strong> ${payLink ? "check Stripe that this order has been paid before starting." : "send a quote and payment link within 1 working day."}</p>`);

  // ---- 2. Confirmation to the customer ----
  const custHtml = wrap(`
<p>Hi ${esc(firstName)},</p>
<p>Thank you for your order. We've received your details${photos.length ? " and " + photos.length + " photo" + (photos.length > 1 ? "s" : "") : ""}.</p>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">Your order</h3>
<table style="border-collapse:collapse;font-size:15px">${details}</table>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">What happens next</h3>
<ol style="padding-left:20px;margin:0">
${payLink ? `<li>If you haven't paid yet, you can pay securely here: <a href="${payLink}" style="color:#8a5a3b">pay for your film</a>.</li>` : `<li>Within one working day we'll email you a quote and a secure payment link.</li>`}
<li>Once you've paid, we'll repair and animate your photos and set them to music.</li>
<li>Your film arrives by email within 5 days of payment.</li>
</ol>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">Your right to cancel</h3>
<p style="margin:0 0 8px">When you ordered, you asked us to start your film straight away and confirmed you understand that you lose your right to cancel once your film is finished. You can cancel for a full refund before we start, or for a partial refund while we're working on it. To cancel, simply reply to this email with your name, order ref <strong>${esc(ref)}</strong> and the date of your order.</p>
<p style="margin:0 0 8px">If you're not happy with your film, tell us within 14 days and we'll redo it. If it still isn't right, we'll refund you. This doesn't affect your legal rights.</p>
<p style="margin:0">Full details: <a href="${BUSINESS.site}/terms.html" style="color:#8a5a3b">Terms</a> &middot; <a href="${BUSINESS.site}/privacy.html" style="color:#8a5a3b">Privacy Policy</a></p>
<p style="margin-top:20px">Any questions, just reply to this email.</p>
<p>Warm wishes,<br>The Memory Project</p>`);

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const from = `"The Memory Project" <${user}>`;

  const results = await Promise.allSettled([
    transporter.sendMail({
      from,
      to: notifyTo,
      replyTo: d.email || undefined,
      subject: `New order ${ref}: ${d.plan || "film"} from ${d.name || "customer"}`,
      html: alertHtml,
    }),
    d.email
      ? transporter.sendMail({
          from,
          to: d.email,
          replyTo: user,
          subject: `Your Memory Project order (ref ${ref})`,
          html: custHtml,
        })
      : Promise.resolve("no customer email"),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(i === 0 ? "Alert email failed:" : "Customer email failed:", r.reason);
  });
  return { statusCode: 200, body: "OK" };
};
