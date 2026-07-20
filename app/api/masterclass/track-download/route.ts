/**
 * Download tracking (Section 4) — POST /api/masterclass/track-download
 *
 * Fired (fire-and-forget) by the State 2 download button just before the
 * browser starts the download. Marks pdf_downloaded on the lead. Always
 * returns 200 — tracking must never interfere with the download.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email =
      typeof body?.email === "string" ? body.email.toLowerCase().trim() : ""
    if (email && email.includes("@")) {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from("masterclass_leads")
        .update({ pdf_downloaded: true })
        .eq("email", email)
      if (error) console.error("[masterclass/track-download] update error:", error)
    }
  } catch (err) {
    console.error("[masterclass/track-download] error:", err)
  }
  return NextResponse.json({ success: true })
}
