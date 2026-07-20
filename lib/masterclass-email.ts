/**
 * Masterclass funnel emails (Sections 3 & 5).
 *
 * Separate from lib/brevo-email.ts because these are MARKETING emails:
 * every one must carry an unsubscribe link (PECR/UK GDPR), they use the
 * masterclass navy/teal template rather than the app's dark template,
 * and they're sent to leads who may never become users.
 *
 * Unsubscribe links are self-authenticating: HMAC-SHA256(email) with a
 * server secret, so the link works for years without a DB token table
 * and nobody can unsubscribe someone else by guessing their email.
 */
import crypto from "crypto"
import { sendBrevoEmail } from "@/lib/brevo-email"

const NAVY = "#0a1628"
const NAVY2 = "#0a1f4e"
const TEAL = "#2dd4bf"

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://metalyzi.co.uk"
}

// ─── Unsubscribe tokens ──────────────────────────────────────────────────────

function unsubSecret(): string {
  // Any stable server-side secret works; never expose which one is used.
  const secret =
    process.env.MASTERCLASS_UNSUB_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("[masterclass-email] no secret available for unsubscribe tokens")
  return secret
}

export function unsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", unsubSecret())
    .update(email.toLowerCase().trim())
    .digest("hex")
    .slice(0, 32)
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function unsubscribeUrl(email: string): string {
  const e = email.toLowerCase().trim()
  return `${siteUrl()}/api/masterclass/unsubscribe?email=${encodeURIComponent(e)}&token=${unsubscribeToken(e)}`
}

// ─── Template ────────────────────────────────────────────────────────────────

function ctaButton(href: string, label: string, variant: "teal" | "navy" = "teal"): string {
  const bg = variant === "teal" ? TEAL : NAVY2
  const color = variant === "teal" ? NAVY : "#ffffff"
  const border = variant === "teal" ? "" : "border:1px solid #1e3a6e;"
  return `
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td>
          <a href="${href}"
             style="display:inline-block;background:${bg};color:${color};${border}padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

/**
 * Navy masterclass template. `email` is required so the legally
 * required unsubscribe link can be baked into the footer of every send.
 */
export function masterclassTemplate(content: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Metalyzi</title>
</head>
<body style="margin:0;padding:0;background:#060d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060d1a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${NAVY};border-radius:12px;border:1px solid #1e3a6e;overflow:hidden;">
          <tr>
            <td style="padding:40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <img src="${siteUrl()}/logo.png" alt="Metalyzi" width="44" height="44" style="display:block;border-radius:10px;border:0;" />
                    <div style="margin-top:8px;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Metalyzi</div>
                  </td>
                </tr>
              </table>
              ${content}
              <p style="color:#9ca3af;font-size:13px;margin-top:28px;line-height:1.6;">
                Good sourcing,<br/>
                The Metalyzi Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #1e3a6e;">
              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.7;text-align:center;">
                You're receiving this because you downloaded the UK Deal Sourcing
                Masterclass from Metalyzi.<br/>
                <a href="${unsubscribeUrl(email)}" style="color:#94a3b8;">Unsubscribe</a>
                &nbsp;·&nbsp; © 2026 Metalyzi. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Email 1 — welcome + PDF delivery (Day 0, sent on capture) ──────────────

export function sendMasterclassWelcomeEmail(
  email: string,
  firstName?: string,
  strategy?: string,
): Promise<boolean> {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,"

  // Light strategy-aware nudge so even the delivery email feels personal.
  const strategyLine =
    strategy === "HMO"
      ? `<p style="color:#cbd5e1;font-size:15px;line-height:1.7;">P.S. Since you're focused on HMOs — don't skip the Article 4 section. It's the check that catches most first-time HMO buyers out.</p>`
      : strategy === "BRRRR"
        ? `<p style="color:#cbd5e1;font-size:15px;line-height:1.7;">P.S. Since you're focused on BRRRR — the refinance numbers chapter shows exactly how much capital you can expect to pull back out.</p>`
        : ""

  const content = `
    <h2 style="color:${TEAL};margin:0 0 16px;font-size:22px;">Your Masterclass 📘</h2>
    <p style="color:#ffffff;font-size:15px;line-height:1.7;">${greeting}</p>
    <p style="color:#cbd5e1;font-size:15px;line-height:1.7;">
      Thanks for downloading The UK Deal Sourcing Masterclass. Here's your copy:
    </p>
    ${ctaButton(`${siteUrl()}/downloads/masterclass.pdf`, "⬇ Download the Masterclass")}
    <p style="color:#cbd5e1;font-size:15px;line-height:1.7;">
      The guide walks you through analysing deals manually — every formula,
      every check.
    </p>
    <p style="color:#cbd5e1;font-size:15px;line-height:1.7;">
      When you're ready to do it faster, Metalyzi runs the whole analysis in
      about 60 seconds. It's free to start:
    </p>
    ${ctaButton(`${siteUrl()}/analyse?utm_source=masterclass_email&utm_campaign=welcome`, "Try Metalyzi Free →", "navy")}
    ${strategyLine}
  `

  return sendBrevoEmail(
    email,
    "📘 Your Deal Sourcing Masterclass is here",
    masterclassTemplate(content, email),
  )
}
