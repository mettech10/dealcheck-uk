/**
 * Masterclass funnel conversion tracking (Section 6).
 *
 * Links Metalyzi signups/payments back to masterclass_leads by email so
 * the admin funnel can measure downloads → signups → paid. Both helpers
 * are idempotent (filtered updates), tolerate a missing lead row (most
 * users never came through the funnel), and NEVER throw — conversion
 * bookkeeping must not break auth or payment flows.
 *
 * Marking signed_up also stops the nurture sequence: NurtureAgent
 * filters on signed_up = false.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export async function markLeadSignedUp(email: string | null | undefined): Promise<void> {
  if (!email) return
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("masterclass_leads")
      .update({ signed_up: true, signed_up_at: new Date().toISOString() })
      .eq("email", email.toLowerCase().trim())
      .eq("signed_up", false)
    if (error) console.warn("[masterclass-conversion] signed_up update failed:", error.message)
  } catch (e) {
    console.warn("[masterclass-conversion] markLeadSignedUp threw:", e)
  }
}

export async function markLeadConvertedToPaid(email: string | null | undefined): Promise<void> {
  if (!email) return
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("masterclass_leads")
      .update({ converted_to_paid: true })
      .eq("email", email.toLowerCase().trim())
      .eq("converted_to_paid", false)
    if (error) console.warn("[masterclass-conversion] converted_to_paid update failed:", error.message)
  } catch (e) {
    console.warn("[masterclass-conversion] markLeadConvertedToPaid threw:", e)
  }
}
