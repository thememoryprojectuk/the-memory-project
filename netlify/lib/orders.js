// Shared helpers for the order emails.
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


// Builds and sends both emails for an order.
// d = form fields, photos = photo URLs, ref = order ref, paid = true if paid by card
async function sendOrderEmails({ d, photos, ref, paid, stripeId }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD not set");
    return false;
  }
  const notifyTo = process.env.NOTIFY_TO || user;
  const isCustom = /^Custom/.test(d.plan || "");
  const occasion = d.occasion === "Something else" && d["occasion-other"] ? d["occasion-other"] : d.occasion;
  const firstName = String(d.name || "").trim().split(/\s+/)[0] || "there";

  const details =
    row("Order ref", ref) +
    row("Film", d.plan) +
    row("Payment", paid ? "Paid by card" : "Quote to follow") +
    row("Photos received", String(photos.length)) +
    row("Occasion", occasion) +
    row("Priority", d.priority) +
    row("Black and white photos", d["black-and-white"] || "No preference") +
    row("Film title", d["film-title"]) +
    row("Message", d.message) +
    row("Music", d.music || "No preference") +
    row("Anything to avoid", d.avoid) +
    row("Heard about us", d["heard-about"]) +
    row("Referred by", d["referred-by"]);

  const photoLinks = photos.length
    ? photos.map((u, i) => `<a href="${esc(u)}" style="color:#8a5a3b">Photo ${i + 1}</a>`).join(" &middot; ")
    : "<em>No photos uploaded</em>";

  const alertHtml = wrap(`
<h2 style="font-family:Georgia,serif;margin:0 0 12px">${paid ? "PAID order" : "Custom Film quote request"}: ${esc(d.plan)}</h2>
<table style="border-collapse:collapse;font-size:15px">
${row("Name", d.name)}${row("Email", d.email)}${details}${stripeId ? row("Stripe payment", stripeId) : ""}
</table>
<p style="margin-top:16px"><strong>Photos:</strong><br>${photoLinks}</p>
<p style="font-size:13px;color:#6b5f55">Customer agreed to the Terms, asked you to start straight away, and confirmed photo permission and age 18+.<br>Reply to this email to contact the customer directly.<br><strong>To do:</strong> ${paid ? (d.priority ? "PRIORITY: make the film and email it within 48 hours." : "make the film and email it within 5 days.") : "send a quote and payment link within 1 working day."}${d["referred-by"] ? "<br><strong>Referral:</strong> this customer was referred by " + esc(d["referred-by"]) + ". Once paid, send that person a single-use £5 code for their next film." : ""}</p>`);

  const custHtml = wrap(`
<p>Hi ${esc(firstName)},</p>
<p>Thank you for your ${paid ? "order and payment" : "Custom Film request"}. We've received your details${photos.length ? " and " + photos.length + " photo" + (photos.length > 1 ? "s" : "") : ""}.</p>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">Your order</h3>
<table style="border-collapse:collapse;font-size:15px">${details}</table>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">What happens next</h3>
<ol style="padding-left:20px;margin:0">
${paid ? `<li>We'll repair and animate your photos and set them to music.</li>
<li>Your film arrives by email within ${d.priority ? "48 hours (Priority)" : "5 days"}.</li>` : `<li>Within one working day we'll email you a quote and a secure payment link.</li>
<li>Once you've paid, we'll repair and animate your photos and set them to music.</li>
<li>Your film arrives by email within 5 days of payment.</li>`}
</ol>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">Your right to cancel</h3>
<p style="margin:0 0 8px">When you ordered, you asked us to start your film straight away and confirmed you understand that you lose your right to cancel once your film is finished. You can cancel for a full refund before we start, or for a partial refund while we're working on it. To cancel, simply reply to this email with your name, order ref <strong>${esc(ref)}</strong> and the date of your order.</p>
<p style="margin:0 0 8px">If you're not happy with your film, tell us within 14 days and we'll redo it. If it still isn't right, we'll refund you. This doesn't affect your legal rights.</p>
<p style="margin:0">Full details: <a href="${BUSINESS.site}/terms.html" style="color:#8a5a3b">Terms</a> &middot; <a href="${BUSINESS.site}/privacy.html" style="color:#8a5a3b">Privacy Policy</a></p>
<p style="margin-top:20px"><strong>Invite a friend:</strong> share your personal link below. Your friend gets £5 off their first film, and when they order, you get £5 off your next one.<br><a href="${BUSINESS.site}/?ref=${encodeURIComponent(ref)}&amp;from=${encodeURIComponent(firstName)}" style="color:#8a5a3b">${BUSINESS.site.replace("https://", "")}/?ref=${esc(ref)}</a></p>
<p>Any questions, just reply to this email.</p>
<p>Warm wishes,<br>The Memory Project</p>`);

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const from = `"The Memory Project" <${user}>`;
  const results = await Promise.allSettled([
    transporter.sendMail({
      from, to: notifyTo, replyTo: d.email || undefined,
      subject: `${d.priority ? "⚡ PRIORITY " : ""}${paid ? "PAID order" : "Quote request"} ${ref}: ${d.plan || "film"} from ${d.name || "customer"}`,
      html: alertHtml,
    }),
    d.email
      ? transporter.sendMail({ from, to: d.email, replyTo: user, subject: `Your Memory Project order (ref ${ref})`, html: custHtml })
      : Promise.resolve("no customer email"),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(i === 0 ? "Alert email failed:" : "Customer email failed:", r.reason);
  });
  return true;
}

// Gift voucher sold: tell the business to create a code, and thank the buyer.
async function sendVoucherEmails({ kind, buyer, email, recipient, amount, stripeId }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) { console.error("GMAIL_USER / GMAIL_APP_PASSWORD not set"); return false; }
  const notifyTo = process.env.NOTIFY_TO || user;
  const film = kind === "FAMILY" ? "Family Film (15 photos)" : "Memory Film (5 photos)";
  const first = String(buyer || "").trim().split(/\s+/)[0] || "there";
  const alertHtml = wrap(`
<h2 style="font-family:Georgia,serif;margin:0 0 12px">🎁 Gift voucher sold: ${esc(film)}</h2>
<table style="border-collapse:collapse;font-size:15px">${row("Buyer", buyer)}${row("Email", email)}${row("Recipient", recipient)}${row("Paid", amount)}${row("Stripe payment", stripeId)}</table>
<p style="margin-top:16px"><strong>To do (within 24 hours):</strong> in Stripe, open the "Gift voucher – ${kind === "FAMILY" ? "Family" : "Memory"} Film" coupon, add a new promotion code (e.g. GIFT-${kind}-XXXX), limit it to 1 redemption and set it to expire in 12 months. Then reply to this email with the code.</p>`);
  const custHtml = wrap(`
<p>Hi ${esc(first)},</p>
<p>Thank you for buying a <strong>${esc(film)}</strong> gift voucher${recipient ? " for " + esc(recipient) : ""}. 🎁</p>
<p>We'll email your voucher code <strong>within 24 hours</strong>. Pass it on with a card or message, and they can use it at <a href="${BUSINESS.site}" style="color:#8a5a3b">${BUSINESS.site.replace("https://", "")}</a> to order their film with their own photos. The code is valid for 12 months.</p>
<p>Any questions, just reply to this email.</p>
<p>Warm wishes,<br>The Memory Project</p>`);
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const from = `"The Memory Project" <${user}>`;
  const results = await Promise.allSettled([
    transporter.sendMail({ from, to: notifyTo, replyTo: email || undefined, subject: `🎁 GIFT VOUCHER sold: ${film} for ${recipient || "someone"} (from ${buyer || email || "customer"})`, html: alertHtml }),
    email ? transporter.sendMail({ from, to: email, replyTo: user, subject: "Your Memory Project gift voucher", html: custHtml }) : Promise.resolve("no email"),
  ]);
  results.forEach((r, i) => { if (r.status === "rejected") console.error(i === 0 ? "Voucher alert failed:" : "Voucher customer email failed:", r.reason); });
  return true;
}

module.exports = { esc, row, wrap, fileUrl, BUSINESS, sendOrderEmails, sendVoucherEmails };
