/**
 * Payment + subscription transactional email helpers.
 *
 * Five templates, all sent via Brevo SMTP using sendBrevoEmail (shared
 * plumbing from lib/brevo-email.ts → same dark-theme baseTemplate, same
 * logoBlock + footer, same retry/error-handling semantics):
 *
 *  1. sendPaymentConfirmationEmail   — Pay-Per-Analysis purchase succeeded
 *  2. sendSubscriptionWelcomeEmail   — Pro subscription kicked off
 *  3. sendRenewalConfirmationEmail   — monthly Pro renewal succeeded
 *  4. sendPaymentFailedEmail         — Pro renewal charge failed
 *  5. sendCancellationEmail          — Pro subscription cancelled
 *
 * Called from the Stripe webhook (app/api/payments/webhook/route.ts) in
 * fire-and-forget mode — wrapped in try/catch so email failures never
 * block payment confirmation. Each function returns a boolean from
 * sendBrevoEmail so the caller can log whether the message sent.
 */

import { sendBrevoEmail, baseTemplate, logoBlock } from "@/lib/brevo-email"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://metalyzi.co.uk"

// ── Shared HTML chunks ──────────────────────────────────────────────────────

/** A green-accented info block used for "what's included" lists, billing
 *  summaries, etc. Matches the dark theme of brevo-email.ts. */
function infoBlock(headline: string, items: string[]): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#0f1c1a;border:1px solid #2dd4bf33;border-radius:8px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#2dd4bf;">
            ${headline}
          </p>
          <ul style="margin:0;padding:0 0 0 18px;color:#a0aec0;font-size:14px;line-height:1.7;">
            ${items.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join("")}
          </ul>
        </td>
      </tr>
    </table>`
}

/** Primary CTA button — teal/black, matches site brand. */
function primaryCta(label: string, url: string, color: string = "#2dd4bf"): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${url}"
             class="cta-button"
             style="display:inline-block;background:${color};color:#0a1628;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:.2px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

/** Reference/transaction-id strip rendered at the bottom of receipts. */
function referenceLine(sessionId?: string): string {
  if (!sessionId) return ""
  return `
    <p style="margin:0;font-size:11px;color:#4b5563;line-height:1.6;text-align:center;">
      Reference: ${sessionId.slice(0, 24)}…
    </p>`
}

// ── 1. Pay-Per-Analysis purchase confirmation ──────────────────────────────

export async function sendPaymentConfirmationEmail(params: {
  userEmail: string
  amount: number
  sessionId: string
}): Promise<boolean> {
  const html = baseTemplate(`
    ${logoBlock()}

    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">
      ✅ Your analysis credit is ready
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
      Thanks for your purchase. We've added <strong style="color:#ffffff;">£${params.amount.toFixed(2)}</strong>
      worth of analysis credit to your account — enough for one full deal report.
    </p>

    ${infoBlock("What this unlocks", [
      "All 6 investment strategies (BTL, HMO, BRRRR, Flip, SA, Development)",
      "AI-powered area + deal analysis",
      "Market comparables with photos",
      "SpareRoom + Airroi market data",
      "Article 4 check",
      "PDF report export",
    ])}

    ${primaryCta("Analyse a Deal Now →", `${SITE_URL}/analyse`)}

    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center;">
      No subscription — just pay when you analyse.
    </p>
    ${referenceLine(params.sessionId)}
  `)
  return sendBrevoEmail(params.userEmail, "✅ Your Metalyzi Analysis is Ready", html)
}

// ── 2. Pro subscription welcome ────────────────────────────────────────────

export async function sendSubscriptionWelcomeEmail(params: {
  userEmail: string
}): Promise<boolean> {
  const html = baseTemplate(`
    ${logoBlock()}

    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">
      🚀 Welcome to Metalyzi Pro
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
      Your Pro subscription is active. You now have unlimited access to
      every feature Metalyzi offers.
    </p>

    ${infoBlock("What's included with Pro", [
      "Unlimited deal analyses",
      "All 6 investment strategies",
      "Full AI insights + strategy-aware area analysis",
      "SpareRoom HMO room data",
      "Airroi SA market data",
      "Market comparables with photos",
      "PDF report export",
      "Unlimited saved deals",
      "Priority support",
      "Early access to new features",
    ])}

    ${primaryCta("Start Analysing →", `${SITE_URL}/analyse`)}

    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;text-align:center;">
      £19.99/month · cancel anytime from your account settings.
    </p>
  `)
  return sendBrevoEmail(params.userEmail, "🎉 Welcome to Metalyzi Pro", html)
}

// ── 3. Monthly Pro renewal confirmation ────────────────────────────────────

export async function sendRenewalConfirmationEmail(params: {
  userEmail: string
  amount: number
  nextBillingDate: Date
}): Promise<boolean> {
  const nextDate = params.nextBillingDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const html = baseTemplate(`
    ${logoBlock()}

    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">
      Subscription renewed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
      Your Metalyzi Pro subscription has been renewed — your unlimited
      access continues without interruption.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#1a1a2e;border-radius:8px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">
            Amount charged: <strong style="color:#ffffff;">£${params.amount.toFixed(2)}</strong>
          </p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">
            Next renewal: <strong style="color:#ffffff;">${nextDate}</strong>
          </p>
        </td>
      </tr>
    </table>

    ${primaryCta("Manage Subscription →", `${SITE_URL}/account`)}

    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;text-align:center;">
      Cancel or update payment method from your account page anytime.
    </p>
  `)
  return sendBrevoEmail(
    params.userEmail,
    `✅ Metalyzi Pro Renewed — £${params.amount.toFixed(2)} charged`,
    html,
  )
}

// ── 4. Renewal payment failed ──────────────────────────────────────────────

export async function sendPaymentFailedEmail(params: {
  userEmail: string
}): Promise<boolean> {
  const html = baseTemplate(`
    ${logoBlock()}

    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f59e0b;line-height:1.3;text-align:center;">
      ⚠ Payment failed
    </h1>
    <p style="margin:0 0 18px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
      We weren't able to take payment for your Metalyzi Pro subscription.
      Your access may be paused if this isn't resolved soon.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.7;text-align:center;">
      The most common causes are an expired card, insufficient funds, or
      a bank fraud check. Updating your payment method usually fixes it.
    </p>

    ${primaryCta("Update Payment Method →", `${SITE_URL}/account`, "#f59e0b")}

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center;">
      Need help? Reply to this email or contact <a href="mailto:contact@metalyzi.co.uk" style="color:#2dd4bf;text-decoration:none;">contact@metalyzi.co.uk</a>.
    </p>
  `)
  return sendBrevoEmail(params.userEmail, "⚠ Action Required — Metalyzi Payment Failed", html)
}

// ── 5. Subscription cancelled ──────────────────────────────────────────────

export async function sendCancellationEmail(params: {
  userEmail: string
}): Promise<boolean> {
  const html = baseTemplate(`
    ${logoBlock()}

    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">
      Subscription cancelled
    </h1>
    <p style="margin:0 0 18px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
      Your Metalyzi Pro subscription has been cancelled. You'll keep Pro
      access until the end of your current billing period — after that,
      you'll move back to the Free tier (3 analyses/month).
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.7;text-align:center;">
      We'd love to hear what didn't work for you — hit reply to let us
      know. Your feedback genuinely helps us improve.
    </p>

    ${primaryCta("Reactivate Pro →", `${SITE_URL}/pricing`)}

    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;text-align:center;">
      You can resubscribe any time from the pricing page.
    </p>
  `)
  return sendBrevoEmail(params.userEmail, "Your Metalyzi Pro has been cancelled", html)
}

// ── 6. Owner notification (internal) ───────────────────────────────────────
//
// Sent to contact@metalyzi.co.uk on every payment event (PPA purchase,
// Pro start, Pro renewal, failed renewal). Plain operational message —
// no marketing wrapper, no logo block, no CTA buttons. Subject line
// carries the type + amount so the inbox view tells the whole story.
//
// The recipient address is configurable via OWNER_NOTIFICATION_EMAIL
// env var so dev / staging can override.

const OWNER_EMAIL =
  process.env.OWNER_NOTIFICATION_EMAIL ?? "contact@metalyzi.co.uk"

export type OwnerPaymentKind =
  | "ppa_purchase"
  | "pro_start"
  | "pro_renewal"
  | "pro_failed"
  | "admin_grant"

interface OwnerPaymentParams {
  kind: OwnerPaymentKind
  amountGbp: number
  userEmail: string
  userId: string
  stripeSessionId?: string | null
  stripeSubscriptionId?: string | null
  note?: string | null
}

const KIND_SUBJECT: Record<OwnerPaymentKind, string> = {
  ppa_purchase: "💷 New Payment — Metalyzi PPA",
  pro_start: "🎉 New Pro Subscriber — Metalyzi",
  pro_renewal: "🔁 Pro Renewal — Metalyzi",
  pro_failed: "⚠ Failed Payment — Metalyzi",
  admin_grant: "🛠 Admin Grant — Metalyzi",
}

const KIND_LABEL: Record<OwnerPaymentKind, string> = {
  ppa_purchase: "Pay Per Analysis",
  pro_start: "Pro Monthly (new)",
  pro_renewal: "Pro Monthly (renewal)",
  pro_failed: "Pro Monthly (FAILED)",
  admin_grant: "Admin Credit Grant",
}

export async function sendOwnerPaymentNotification(
  params: OwnerPaymentParams,
): Promise<boolean> {
  const amountFmt = `£${params.amountGbp.toFixed(2)}`
  const subject = `${KIND_SUBJECT[params.kind]} ${amountFmt}`
  const now = new Date().toISOString()

  const stripeLine = params.stripeSessionId
    ? `Stripe Session: ${params.stripeSessionId}
View in Stripe: https://dashboard.stripe.com/payments/${params.stripeSessionId}`
    : params.stripeSubscriptionId
      ? `Stripe Subscription: ${params.stripeSubscriptionId}
View in Stripe: https://dashboard.stripe.com/subscriptions/${params.stripeSubscriptionId}`
      : "Stripe Session: (none — non-Stripe event)"

  // Plain text body — operational, not marketing. Wrapped in basic
  // HTML so Brevo's text/HTML auto-detection doesn't strip it.
  const html = `<pre style="font-family:Menlo,Consolas,monospace;white-space:pre-wrap;color:#111;background:#fff;padding:16px;">
${params.kind === "pro_failed" ? "⚠ PAYMENT FAILED ⚠" : "Payment received on Metalyzi."}

Type:        ${KIND_LABEL[params.kind]}
Amount:      ${amountFmt}
User:        ${params.userEmail}
User ID:     ${params.userId}
${stripeLine}
Time:        ${now}
${params.note ? `Note:        ${params.note}` : ""}

View in Admin: ${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.metalyzi.co.uk"}/admin/users
</pre>`

  return sendBrevoEmail(OWNER_EMAIL, subject, html)
}
