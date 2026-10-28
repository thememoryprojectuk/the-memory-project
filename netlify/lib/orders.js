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
    row("Needed by", fmtDate(d["needed-by"])) +
    row("Black and white photos", d["black-and-white"] || "No preference") +
    row("Film title", d["film-title"]) +
    row("Message", d.message) +
    row("Music", d.music || "No preference");

  const photoLinks = photos.length
    ? photos.map((u, i) => `<a href="${esc(u)}" style="color:#8a5a3b">Photo ${i + 1}</a>`).join(" &middot; ")
    : "<em>No photos uploaded</em>";

  const alertHtml = wrap(`
<h2 style="font-family:Georgia,serif;margin:0 0 12px">${paid ? "PAID order" : "Custom Film quote request"}: ${esc(d.plan)}</h2>
<table style="border-collapse:collapse;font-size:15px">
${row("Name", d.name)}${row("Email", d.email)}${details}${stripeId ? row("Stripe payment", stripeId) : ""}
</table>
<p style="margin-top:16px"><strong>Photos:</strong><br>${photoLinks}</p>
<p style="font-size:13px;color:#6b5f55">Customer agreed to the Terms, asked you to start straight away, and confirmed photo permission and age 18+.<br>Reply to this email to contact the customer directly.<br><strong>To do:</strong> ${paid ? "make the film and email it within 5 days." : "send a quote and payment link within 1 working day."}</p>`);

  const custHtml = wrap(`
<p>Hi ${esc(firstName)},</p>
<p>Thank you for your ${paid ? "order and payment" : "Custom Film request"}. We've received your details${photos.length ? " and " + photos.length + " photo" + (photos.length > 1 ? "s" : "") : ""}.</p>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">Your order</h3>
<table style="border-collapse:collapse;font-size:15px">${details}</table>
<h3 style="font-family:Georgia,serif;margin:20px 0 6px">What happens next</h3>
<ol style="padding-left:20px;margin:0">
${paid ? `<li>We'll repair and animate your photos and set them to music.</li>
<li>Your film arrives by email within 5 days.</li>` : `<li>Within one working day we'll email you a quote and a secure payment link.</li>
<li>Once you've paid, we'll repair and animate your photos and set them to music.</li>
<li>Your film arrives by email within 5 days of payment.</li>`}
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
      from, to: notifyTo, replyTo: d.email || undefined,
      subject: `${paid ? "PAID order" : "Quote request"} ${ref}: ${d.plan || "film"} from ${d.name || "customer"}`,
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

module.exports = { esc, row, wrap, fileUrl, BUSINESS, sendOrderEmails };
