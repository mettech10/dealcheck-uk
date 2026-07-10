import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Referral codes for Share This Deal.
 *
 * GET  — get-or-create the logged-in user's referral code. Lazy generation
 *        (first 8 hex chars of the user id, uppercased) keeps the signup
 *        webhook untouched; the code appears the first time it's needed.
 * POST — claim a referral: { code } attributes the logged-in (recently
 *        created) account to the code's owner. Idempotent — one referral
 *        per referred account, self-referrals rejected.
 */

export const runtime = "nodejs"

function generateReferralCode(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase()
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("referral_code")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing?.referral_code) {
    return NextResponse.json({ referralCode: existing.referral_code })
  }

  const code = generateReferralCode(user.id)

  if (existing) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({ referral_code: code })
      .eq("user_id", user.id)
    if (error) {
      console.error("[Referral] code update failed:", error.message)
      return NextResponse.json({ error: "update failed" }, { status: 500 })
    }
  } else {
    // No subscription row yet (fresh free account) — create the minimal one.
    const { error } = await supabase.from("user_subscriptions").upsert(
      {
        user_id: user.id,
        tier: "free",
        status: "active",
        referral_code: code,
      },
      { onConflict: "user_id" },
    )
    if (error) {
      console.error("[Referral] code insert failed:", error.message)
      return NextResponse.json({ error: "insert failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ referralCode: code })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  let code: string
  try {
    const body = await request.json()
    code = String(body?.code ?? "").trim().toUpperCase()
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }
  if (!code || code.length > 20) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 })
  }

  // Attribution window — an account that has existed for over 30 days
  // wasn't referred by this share card.
  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0
  if (Date.now() - createdAt > 30 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "outside referral window" }, { status: 422 })
  }

  const supabase = createAdminClient()

  const { data: referrer } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("referral_code", code)
    .maybeSingle()

  if (!referrer) {
    return NextResponse.json({ error: "unknown code" }, { status: 404 })
  }
  if (referrer.user_id === user.id) {
    return NextResponse.json({ error: "self referral" }, { status: 422 })
  }

  const { error } = await supabase.from("referrals").insert({
    referral_code: code,
    referred_user_id: user.id,
    referrer_user_id: referrer.user_id,
    status: "pending",
  })

  if (error) {
    // Unique violation on referred_user_id → already attributed. Fine.
    if (error.code === "23505") {
      return NextResponse.json({ status: "already-claimed" }, { status: 409 })
    }
    console.error("[Referral] claim failed:", error.message)
    return NextResponse.json({ error: "claim failed" }, { status: 500 })
  }

  return NextResponse.json({ status: "claimed" })
}
