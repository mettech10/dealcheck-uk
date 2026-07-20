/**
 * GET /api/admin/masterclass-funnel (Section 7)
 *
 * Pre-aggregated funnel stats for the admin masterclass dashboard:
 * totals (downloads → signups → paid), breakdowns by investor type and
 * strategy, email-sequence stage counts, and signups by the stage the
 * lead had reached when they converted (the sequence freezes on signup,
 * so nurture_stage at signup time = "which email got them over the line").
 *
 * Aggregated in JS over one batched read — same trade-off as
 * /api/admin/analytics; revisit past ~10k leads.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

interface LeadRow {
  investor_type: string | null
  main_strategy: string | null
  utm_source: string | null
  pdf_downloaded: boolean
  signed_up: boolean
  converted_to_paid: boolean
  nurture_stage: number
  unsubscribed: boolean
}

interface SegmentStats {
  segment: string
  downloads: number
  signups: number
  paid: number
  conversionPct: number
}

function aggregate(rows: LeadRow[], key: "investor_type" | "main_strategy" | "utm_source"): SegmentStats[] {
  const map = new Map<string, { downloads: number; signups: number; paid: number }>()
  for (const r of rows) {
    const seg = r[key] ?? "unknown"
    const entry = map.get(seg) ?? { downloads: 0, signups: 0, paid: 0 }
    entry.downloads++
    if (r.signed_up) entry.signups++
    if (r.converted_to_paid) entry.paid++
    map.set(seg, entry)
  }
  return [...map.entries()]
    .map(([segment, v]) => ({
      segment,
      ...v,
      conversionPct: v.downloads > 0 ? Math.round((v.signups / v.downloads) * 100) : 0,
    }))
    .sort((a, b) => b.downloads - a.downloads)
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("masterclass_leads")
    .select(
      "investor_type, main_strategy, utm_source, pdf_downloaded, signed_up, converted_to_paid, nurture_stage, unsubscribed",
    )
    .limit(10000)

  if (error) {
    console.error("[admin/masterclass-funnel] query error:", error)
    return NextResponse.json({ error: "query failed" }, { status: 500 })
  }

  const rows = (data ?? []) as LeadRow[]
  const total = rows.length
  const signups = rows.filter((r) => r.signed_up).length
  const paid = rows.filter((r) => r.converted_to_paid).length
  const unsubscribed = rows.filter((r) => r.unsubscribed).length

  // How many leads have RECEIVED each email (stage N = email N sent).
  const stageSent: Record<number, number> = {}
  for (let stage = 1; stage <= 5; stage++) {
    stageSent[stage] = rows.filter((r) => r.nurture_stage >= stage).length
  }
  // Signed-up leads grouped by the stage they'd reached when they converted.
  const signupsByStage: Record<number, number> = {}
  for (const r of rows) {
    if (r.signed_up) signupsByStage[r.nurture_stage] = (signupsByStage[r.nurture_stage] ?? 0) + 1
  }

  return NextResponse.json({
    totals: {
      downloads: total,
      signups,
      signupPct: total > 0 ? Math.round((signups / total) * 100) : 0,
      paid,
      paidPct: total > 0 ? Math.round((paid / total) * 100) : 0,
      unsubscribed,
    },
    byInvestorType: aggregate(rows, "investor_type"),
    byStrategy: aggregate(rows, "main_strategy"),
    byUtmSource: aggregate(rows, "utm_source"),
    emailPerformance: { stageSent, signupsByStage },
  })
}
