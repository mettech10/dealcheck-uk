/**
 * POST /api/admin/credits/grant
 *
 * Admin-only path. Adds N credits to a user's current-month
 * balance via the admin_grant_credits RPC, logs an admin_grant
 * row in payment_history with the granting admin's id + notes,
 * and (best-effort) emails the user.
 *
 * Body:
 *   { userId: uuid, amount: integer, notes?: string }
 *
 * Negative amounts are allowed for refund / mistake-fix scenarios —
 * the RPC clamps the resulting balance to >= 0.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"
import {
  sendBrevoEmail,
  baseTemplate,
  logoBlock,
} from "@/lib/brevo-email"
import { sendOwnerPaymentNotification } from "@/lib/paymentEmails"

export const dynamic = "force-dynamic"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.metalyzi.co.uk"

interface GrantBody {
  userId?: string
  amount?: number
  notes?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  // ── Admin gate ───────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user: admin_user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(admin_user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  let body: GrantBody = {}
  try {
    body = (await req.json()) as GrantBody
  } catch {
    /* fall through */
  }
  const userId = (body.userId || "").trim()
  const amount = Number(body.amount)
  const notes = body.notes?.toString().slice(0, 500) ?? null

  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "bad_userId" }, { status: 400 })
  }
  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json(
      { error: "amount must be a non-zero integer" },
      { status: 400 },
    )
  }

  // ── Apply the grant ──────────────────────────────────────────
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("admin_grant_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_admin_id: admin_user!.id,
    p_notes: notes,
  })
  if (error) {
    console.error("[admin/credits/grant] RPC failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const newBalance = typeof data === "number" ? data : Number(data ?? 0)

  // ── Email the granted user ───────────────────────────────────
  // Best-effort — log warnings, don't block the response on Brevo.
  let userEmail: string | null = null
  try {
    const { data: u } = await admin.auth.admin.getUserById(userId)
    userEmail = u.user?.email ?? null
  } catch {
    /* ignore */
  }

  if (userEmail && amount > 0) {
    const html = baseTemplate(`
      ${logoBlock()}
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;text-align:center;">
        Your Metalyzi account has been topped up
      </h1>
      <p style="margin:0 0 18px;font-size:15px;color:#9ca3af;line-height:1.7;text-align:center;">
        Our team added <strong style="color:#2dd4bf">${amount} analysis credit${amount === 1 ? "" : "s"}</strong> to your account.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.7;text-align:center;">
        New balance: <strong style="color:#ffffff">${newBalance} credit${newBalance === 1 ? "" : "s"}</strong>.
        ${notes ? `<br/><br/><em>Note: ${notes}</em>` : ""}
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${SITE_URL}/analyse" style="display:inline-block;background:#2dd4bf;color:#0f1c1a;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Run an Analysis →</a>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center;">
        Questions? Reply to this email or contact <a href="mailto:contact@metalyzi.co.uk" style="color:#2dd4bf;text-decoration:none;">contact@metalyzi.co.uk</a>.
      </p>
    `)
    try {
      await sendBrevoEmail(
        userEmail,
        `✅ ${amount} analysis credit${amount === 1 ? "" : "s"} added to your Metalyzi account`,
        html,
      )
    } catch (e) {
      console.warn("[admin/credits/grant] user notification email failed:", e)
    }
  }

  // ── Owner audit notification ─────────────────────────────────
  if (userEmail) {
    try {
      await sendOwnerPaymentNotification({
        kind: "admin_grant",
        amountGbp: 0,
        userEmail,
        userId,
        note: `${amount > 0 ? "+" : ""}${amount} credit(s) by admin ${admin_user!.email}. ${notes ?? ""}`.trim(),
      })
    } catch (e) {
      console.warn("[admin/credits/grant] owner notification failed:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    newBalance,
    granted: amount,
  })
}
