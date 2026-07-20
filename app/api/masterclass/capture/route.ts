/**
 * Masterclass lead capture (Section 3) — POST /api/masterclass/capture
 *
 * Saves/updates the lead, fires the welcome email with the PDF link, and
 * returns the download URL. Two hard rules from the spec:
 *   - NEVER block the download: DB or email failures still return success.
 *   - Repeat submissions must not restart the nurture sequence, so we
 *     SELECT-then-write instead of the naive upsert (which would reset
 *     nurture_stage back to 1 for a lead already at stage 3+).
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendMasterclassWelcomeEmail } from "@/lib/masterclass-email"

export const runtime = "nodejs"

const DOWNLOAD_URL = "/downloads/masterclass.pdf"

const clip = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const emailRaw = typeof body.email === "string" ? body.email : ""
  const email = emailRaw.toLowerCase().trim()
  if (!email || !email.includes("@") || email.length > 255) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const firstName = clip(body.firstName, 100)
  const investorType = clip(body.investorType, 50)
  const mainStrategy = clip(body.mainStrategy, 50)

  try {
    const supabase = createAdminClient()

    const { data: existing } = await supabase
      .from("masterclass_leads")
      .select("id, nurture_stage")
      .eq("email", email)
      .maybeSingle()

    if (existing) {
      // Repeat download — refresh profile fields, keep nurture progress.
      const { error } = await supabase
        .from("masterclass_leads")
        .update({
          first_name: firstName,
          investor_type: investorType,
          main_strategy: mainStrategy,
          pdf_downloaded: true,
          // A lead who somehow never entered the sequence starts it now.
          nurture_stage: existing.nurture_stage === 0 ? 1 : existing.nurture_stage,
        })
        .eq("id", existing.id)
      if (error) console.error("[masterclass/capture] update error:", error)
    } else {
      const { error } = await supabase.from("masterclass_leads").insert({
        first_name: firstName,
        email,
        investor_type: investorType,
        main_strategy: mainStrategy,
        utm_source: clip(body.utmSource, 100),
        utm_campaign: clip(body.utmCampaign, 100),
        utm_medium: clip(body.utmMedium, 100),
        referrer: clip(body.referrer, 2000),
        pdf_downloaded: true,
        nurture_stage: 1, // welcome email (stage 1) goes out below
      })
      if (error) console.error("[masterclass/capture] insert error:", error)
    }
  } catch (err) {
    // Don't block the download on DB errors — still let them download.
    console.error("[masterclass/capture] DB error:", err)
  }

  // Welcome email with the PDF link. Awaited (Vercel freezes the function
  // after the response — fire-and-forget work gets killed), but a failure
  // never blocks the download.
  await sendMasterclassWelcomeEmail(email, firstName ?? undefined, mainStrategy ?? undefined).catch(
    (err) => console.error("[masterclass/capture] Email error:", err),
  )

  return NextResponse.json({ success: true, downloadUrl: DOWNLOAD_URL })
}
