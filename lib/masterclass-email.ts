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

// ─── Nurture emails 2-5 (Section 5) ──────────────────────────────────────────
//
// Sent by NurtureAgent. Stages 2 and 3 are personalised by main_strategy:
// HMO leads get the Article 4 story FIRST (it's their highest-stakes check),
// BRRRR leads get capital-recycling numbers first, "not sure" leads get the
// strategy comparison — everyone else gets yield-then-Article-4.

interface NurtureLead {
  email: string
  first_name?: string | null
  main_strategy?: string | null
}

const p = (text: string) =>
  `<p style="color:#cbd5e1;font-size:15px;line-height:1.7;">${text}</p>`
const h = (text: string) =>
  `<h2 style="color:${TEAL};margin:0 0 16px;font-size:21px;">${text}</h2>`

function analyseCta(campaign: string, label = "Run a free analysis →"): string {
  return ctaButton(
    `${siteUrl()}/analyse?utm_source=masterclass_email&utm_campaign=${campaign}`,
    label,
  )
}

/** Educational block A — gross vs net yield (from Chapter 3 of the guide). */
function yieldEmail(greeting: string): { subject: string; content: string } {
  return {
    subject: "The #1 number most investors get wrong",
    content: `
      ${h("Gross yield lies to you")}
      ${p(greeting)}
      ${p(
        "Quick one from Chapter 3 of the masterclass, because it's the mistake we see most: judging a deal on gross yield.",
      )}
      ${p(
        "A £150,000 house renting at £850/month is a 6.8% gross yield — sounds fine. Subtract the stressed mortgage payment, 10% management, maintenance, insurance and one void month a year, and you're left with about £147/month. That's a 3.7% return on the £47,500 cash in the deal. Still fine — but a very different decision.",
      )}
      ${p(
        "An 8% gross HMO with landlord-paid bills can cashflow <em>worse</em> than a 6% single let. Net cashflow and return-on-cash decide deals. Gross yield only filters them.",
      )}
      ${p(
        "Metalyzi calculates net yield, stressed cashflow and return-on-cash automatically — try it on a deal you're looking at right now:",
      )}
      ${analyseCta("nurture_yield", "Try a free analysis →")}`,
  }
}

/** Educational block B — the Article 4 near-miss story (Chapter 4). */
function article4Email(greeting: string): { subject: string; content: string } {
  return {
    subject: "This one check saves investors thousands",
    content: `
      ${h("The £30,000 mistake that takes 60 seconds to avoid")}
      ${p(greeting)}
      ${p(
        "A story we hear constantly: an investor agrees to buy a 4-bed terrace to convert to an HMO. Numbers stack, refurb priced, solicitor instructed. Three weeks in, their solicitor mentions the street sits inside an Article 4 direction — converting a family home to an HMO there needs full planning permission, and that council refuses almost all of them.",
      )}
      ${p(
        "No HMO means single-let rent, and the deal dies — after survey, legal and finance costs. Article 4 now covers large parts of Manchester, Birmingham, Nottingham, Leeds and most university towns, and it's spreading.",
      )}
      ${p(
        "The fix is checking BEFORE you offer. Metalyzi shows Article 4 status for any English postcode, free:",
      )}
      ${ctaButton(
        `${siteUrl()}/article4-map?utm_source=masterclass_email&utm_campaign=nurture_article4`,
        "Check Article 4 on any postcode →",
      )}`,
  }
}

/** Educational block C — BRRRR capital recycling (for BRRRR leads). */
function brrrrEmail(greeting: string): { subject: string; content: string } {
  return {
    subject: "The only BRRRR number that matters",
    content: `
      ${h("Money left in — the BRRRR scoreboard")}
      ${p(greeting)}
      ${p(
        "Since you're focused on BRRRR, here's the number that separates a good project from a great one: money left in after refinance.",
      )}
      ${p(
        "Buy at £110,000, spend £25,000 on the refurb, £8,000 on costs — £143,000 all-in. If it revalues at £165,000, a 75% remortgage returns £123,750 and leaves just £19,250 in a cashflowing property. Do that three times and one deposit has bought three houses.",
      )}
      ${p(
        "The trap is buying so close to end value that the refinance can't release anything. All-in at or below 75-80% of end value is the filter — check it before you offer, not after.",
      )}
      ${p("Metalyzi models the full BRRRR cycle — refinance, money left in, post-refi cashflow — in one analysis:")}
      ${analyseCta("nurture_brrrr", "Model a BRRRR deal free →")}`,
  }
}

/** Educational block D — strategy comparison (for "not sure" leads). */
function strategyCompareEmail(greeting: string): { subject: string; content: string } {
  return {
    subject: "Which property strategy actually fits you?",
    content: `
      ${h("Six strategies, one honest comparison")}
      ${p(greeting)}
      ${p(
        "You told us you're still weighing up strategies — the fastest shortcut is matching the strategy to your time and capital, not to whatever's loud on social media.",
      )}
      ${p(
        "Hands-off with steady capital? Single-let BTL. Chasing income and happy to manage intensively? HMO — but check Article 4 first. Want your deposit back out to go again? BRRRR. Lump-sum profit and no tenants? Flip, priced with the 70-75% rule. SA and development pay more and demand more.",
      )}
      ${p(
        "Chapter 1 of your masterclass breaks down all six with the numbers investors expect from each. The fastest way to compare them on a real property: run one analysis and switch strategies — Metalyzi recalculates everything per strategy.",
      )}
      ${analyseCta("nurture_compare", "Compare strategies on a real deal →")}`,
  }
}

/** Email 4 (Day 7) — direct but warm check-in. */
function checkInEmail(greeting: string, firstName?: string | null): { subject: string; content: string } {
  return {
    subject: firstName ? `${firstName}, analysed any deals yet?` : "Analysed any deals yet?",
    content: `
      ${h("Have you put the masterclass to work?")}
      ${p(greeting)}
      ${p(
        "You downloaded the Deal Sourcing Masterclass a week ago. Quick, honest question: have you run the numbers on a real deal yet?",
      )}
      ${p(
        "If not, that's normal — the manual workflow in Chapter 3 takes about an hour per property while you're learning it. Here's the fastest way to close that gap: pick any live listing on Rightmove, paste the link into Metalyzi, and 60 seconds later you'll have the yield, stressed cashflow, SDLT, deal score and comparables — the whole Chapter 3 checklist, done.",
      )}
      ${p(
        "Your first three analyses are free every month, so trying it on today's shortlist costs nothing:",
      )}
      ${analyseCta("nurture_checkin", "Run your first analysis →")}`,
  }
}

/** Email 5 (Day 12) — final nudge, free tier + Pro mention. */
function finalNudgeEmail(greeting: string): { subject: string; content: string } {
  return {
    subject: "Your free analyses are waiting",
    content: `
      ${h("3 free analyses. Still unclaimed.")}
      ${p(greeting)}
      ${p(
        "Last note from us on the masterclass series. Your Metalyzi account tier includes 3 free deal analyses every month — no card, no catch — and yours are still sitting there.",
      )}
      ${p(
        "If you're actively sourcing or vetting deals, that's three properties fully analysed — net cashflow, SDLT, Article 4, comparables, deal score — before you spend a penny. Serious sourcers doing volume upgrade to Pro for unlimited analyses and branded investor packs, but you don't need that to start.",
      )}
      ${p(
        "The best time to run the numbers is before the next viewing, not after the offer:",
      )}
      ${analyseCta("nurture_final", "Start free →")}`,
  }
}

/**
 * Send the nurture email for a given stage (2-5). Returns Brevo's success
 * boolean so the agent only advances nurture_stage on a real send.
 */
export function sendNurtureEmail(lead: NurtureLead, stage: number): Promise<boolean> {
  const greeting = lead.first_name ? `Hi ${lead.first_name},` : "Hi there,"
  const strategy = lead.main_strategy ?? ""

  let email: { subject: string; content: string }
  switch (stage) {
    case 2:
      // Personalised lead-off: HMO → Article 4 first; BRRRR → capital
      // recycling; not sure → strategy comparison; default → yield.
      email =
        strategy === "HMO"
          ? article4Email(greeting)
          : strategy === "BRRRR"
            ? brrrrEmail(greeting)
            : strategy === "not_sure"
              ? strategyCompareEmail(greeting)
              : yieldEmail(greeting)
      break
    case 3:
      // Whichever of yield/Article-4 they haven't had yet.
      email = strategy === "HMO" || strategy === "BRRRR" || strategy === "not_sure"
        ? yieldEmail(greeting)
        : article4Email(greeting)
      break
    case 4:
      email = checkInEmail(greeting, lead.first_name)
      break
    case 5:
      email = finalNudgeEmail(greeting)
      break
    default:
      return Promise.resolve(false)
  }

  return sendBrevoEmail(lead.email, email.subject, masterclassTemplate(email.content, lead.email))
}
