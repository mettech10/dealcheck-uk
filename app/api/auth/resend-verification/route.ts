import { createAdminClient } from "@/lib/supabase/admin"
import { sendVerificationEmail } from "@/lib/brevo-email"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/resend-verification
 * Resend the Brevo-branded verification email for an unconfirmed account.
 * Uses admin.generateLink so Supabase never sends its own email.
 *
 * Hardening (2026-06): generateLink(type:"signup") CREATES a user when the
 * email doesn't exist, which let anonymous callers pollute auth.users and
 * relay "verification" emails to arbitrary strangers through our Brevo
 * quota. Now: a user this call just created is deleted and no email is
 * sent; responses are uniform so the endpoint can't be used to enumerate
 * accounts; and a per-instance cooldown blunts burst abuse.
 */

const GENERIC_OK = { message: "If an unverified account exists for that address, a verification email has been sent." }

// Per-email cooldown. In-memory, so per serverless instance only — a soft
// control on bursts, not a global limiter.
const lastSend = new Map<string, number>()
const COOLDOWN_MS = 60_000

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      )
    }
    const normalised = email.trim().toLowerCase()

    const last = lastSend.get(normalised) ?? 0
    if (Date.now() - last < COOLDOWN_MS) {
      return NextResponse.json(GENERIC_OK)
    }
    lastSend.set(normalised, Date.now())
    if (lastSend.size > 10_000) lastSend.clear()

    const { headers } = await import("next/headers")
    const headersList = await headers()
    const host = headersList.get("host") || ""
    const protocol = headersList.get("x-forwarded-proto") || "https"
    const origin = `${protocol}://${host}`
    const callbackBase =
      process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
      `${origin}/auth/callback`
    const redirectTo = `${callbackBase}?source=email_verify`

    const adminClient = createAdminClient()
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email: normalised,
      password: crypto.randomUUID(),
      options: { redirectTo },
    })

    if (error) {
      // Most commonly "already registered/confirmed" — answer exactly like
      // the success path so the endpoint can't confirm whether an account
      // exists or its verification state.
      console.warn("[Resend Verification] generateLink rejected:", error.message)
      return NextResponse.json(GENERIC_OK)
    }

    // If generateLink had to CREATE this user, the address had no account —
    // this endpoint must not be a signup side-channel. Remove the row and
    // send nothing. (A genuinely unconfirmed account is minutes old at the
    // youngest by the time a human reaches the resend button; one created
    // by this very call is milliseconds old.)
    const createdAt = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0
    const justCreatedByThisCall =
      !!data.user?.id &&
      !data.user?.email_confirmed_at &&
      !data.user?.last_sign_in_at &&
      createdAt > 0 &&
      Date.now() - createdAt < 5_000
    if (justCreatedByThisCall) {
      try {
        await adminClient.auth.admin.deleteUser(data.user!.id)
      } catch (e) {
        console.error("[Resend Verification] cleanup of probe-created user failed:", e)
      }
      return NextResponse.json(GENERIC_OK)
    }

    const verificationUrl = data.properties.action_link
    const sent = await sendVerificationEmail(normalised, verificationUrl)
    if (!sent) {
      console.error("[Resend Verification] Brevo send failed for", normalised)
    }
    return NextResponse.json(GENERIC_OK)
  } catch (err) {
    console.error("[Resend Verification] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
