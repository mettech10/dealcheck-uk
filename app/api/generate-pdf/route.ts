import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { readFile } from "fs/promises"
import path from "path"
import { getSessionUser } from "@/lib/apiAuth"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkCanAnalyse } from "@/lib/usageGate"
import { tierFromId } from "@/lib/tiers"
import { scoreDeal } from "@/lib/dealScoring"
import { buildScoringInput } from "@/lib/buildScoringInput"
import {
  DealPackageDocument,
  type DealPackageInput,
} from "@/lib/pdf/deal-package"
import type {
  BackendResults,
  CalculationResults,
  PropertyFormData,
} from "@/lib/types"
import type { RefurbAnalysisResult } from "@/lib/refurbAnalysis"
import type { DealPdfEvidence } from "@/lib/pdfEvidence"
import { checkArticle4 } from "@/lib/article4-service"

/**
 * Deal Packaging Engine — POST /api/generate-pdf
 *
 * Renders the 8-page branded Deal Package PDF from the exact objects the
 * results page displays. The deal score is recomputed server-side with the
 * same scoreDeal engine the page uses (identical output, tamper-proof);
 * AI text is passed through verbatim; nothing is recalculated.
 *
 * Access: tier.unlocks.pdfExport (pay_per_analysis / pro / enterprise) or a
 * positive paid-credit balance. Free tier → 403 and the client shows the
 * existing pdf_locked upgrade modal. PDFs are never cached — fresh render,
 * fresh report ID, logged to pdf_downloads every time.
 */

export const maxDuration = 120
export const runtime = "nodejs"

const ALLOWED_IMAGE_HOSTS = new Set([
  "media.rightmove.co.uk",
  "lid.zoocdn.com",
  "st.zoocdn.com",
  "media.onthemarket.com",
])

/** Fetch a listing image server-side → data URI; null on any failure. */
async function fetchImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
      return null
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? "image/jpeg"
    if (!type.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 6 * 1024 * 1024) return null // keep the PDF small
    return `data:${type};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

async function loadLogoDataUri(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "logo-navy.png"))
    return `data:image/png;base64,${file.toString("base64")}`
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  // ── Access gate ─────────────────────────────────────────────────────
  const gate = await checkCanAnalyse(user.id)
  const tier = tierFromId(gate.tier)
  const canExportPdf = tier.unlocks.pdfExport || gate.paidCredits > 0
  if (!canExportPdf) {
    return NextResponse.json(
      { error: "PDF export requires Pro or a purchased analysis", reason: "pdf_locked" },
      { status: 403 },
    )
  }

  let body: {
    data?: PropertyFormData
    results?: CalculationResults
    backendData?: BackendResults | null
    refurbAnalysis?: RefurbAnalysisResult | null
    /** Live market evidence lifted from the results page (sold/rental/ARV
     *  comparables + Article 4) — preferred over backendData equivalents. */
    evidence?: DealPdfEvidence | null
    images?: string[]
    floorplans?: string[]
    preparedFor?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { data, results, backendData } = body
  if (!data?.purchasePrice || !results) {
    return NextResponse.json(
      { error: "data and results are required" },
      { status: 400 },
    )
  }

  const reportId = randomUUID().slice(0, 8).toUpperCase()
  const generatedAt = new Date().toISOString()

  // ── Server-side evidence backfill ───────────────────────────────────
  // The client lifts the comparables/Article 4 it displayed, but a user
  // can click Download before those (scraper-backed, slow) fetches
  // resolve — the report must never ship without its market evidence.
  // Anything missing is fetched here through the same internal routes,
  // forwarding the caller's auth cookie, so PDF numbers still match what
  // the page would show.
  const evidence: DealPdfEvidence = { ...(body.evidence ?? {}) }
  const origin = new URL(request.url).origin
  const cookie = request.headers.get("cookie") ?? ""
  const postJson = async (
    path: string,
    payload: unknown,
    timeoutMs: number,
  ): Promise<Record<string, any> | null> => {
    try {
      const r = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    }
  }

  if (data.postcode) {
    await Promise.all([
      // Rental comparables (the sidebar Rental tab data)
      (async () => {
        if (evidence.rentalComps?.length) return
        const json = await postJson(
          "/api/comparables/rental-listings",
          {
            postcode: data.postcode,
            bedrooms: data.bedrooms,
            ...(data.propertyType ? { propertyType: data.propertyType } : {}),
            ...(data.propertyTypeDetail ? { propertyTypeDetail: data.propertyTypeDetail } : {}),
            strategy: data.investmentType || "btl",
          },
          60000,
        )
        const d = json?.success ? json.data : null
        if (d?.listings?.length) {
          evidence.rentalComps = d.listings
            .slice(0, 6)
            .map((l: Record<string, any>) => ({
              address: String(l.address ?? ""),
              monthlyRent: Number(l.monthlyRent ?? 0),
              bedrooms: (l.bedrooms as number | null) ?? null,
              propertyType: l.propertyType ? String(l.propertyType) : undefined,
            }))
            .filter((c: { monthlyRent: number }) => c.monthlyRent > 0)
          evidence.rentalSummary = {
            averageRent: Number(d.averageRent ?? 0),
            minRent: Number(d.minRent ?? 0),
            maxRent: Number(d.maxRent ?? 0),
            count: Number(d.count ?? 0),
          }
          console.log(`[DEAL-PDF] backfilled ${evidence.rentalComps?.length} rental comps`)
        }
      })(),
      // Sold comparables (Rightmove-first route; drives the valuation avg)
      (async () => {
        if (evidence.soldComps?.length) return
        const json = await postJson(
          "/api/comparables/sold",
          {
            postcode: data.postcode,
            bedrooms: data.bedrooms,
            ...(data.propertyTypeDetail ? { propertyTypeDetail: data.propertyTypeDetail } : {}),
            ...(data.propertyType ? { propertyType: data.propertyType } : {}),
          },
          60000,
        )
        const d = json?.success ? json.data ?? json : null
        if (d?.sales?.length) {
          const label =
            json?.source === "rightmove_sold" ? "Rightmove sold" : "Land Registry"
          evidence.soldComps = d.sales
            .slice(0, 6)
            .map((s: Record<string, any>) => ({
              address: String(s.street ?? s.address ?? ""),
              price: Number(s.price ?? 0),
              date: s.date ? String(s.date) : undefined,
              propertyType: s.propertyType ? String(s.propertyType) : undefined,
              tenure: s.tenure ? String(s.tenure) : undefined,
              source: label,
            }))
            .filter((c: { price: number }) => c.price > 0)
          evidence.soldAverage = (d.average as number | null) ?? null
          console.log(`[DEAL-PDF] backfilled ${evidence.soldComps?.length} sold comps (${label})`)
        }
      })(),
      // Live Article 4 status (direct lib call — no HTTP round-trip)
      (async () => {
        if (evidence.article4) return
        try {
          const admin = createAdminClient()
          const r = await checkArticle4(admin, data.postcode!)
          evidence.article4 = {
            status:
              r.status === "active" || r.status === "proposed" || r.status === "none"
                ? r.status
                : "unknown",
            summary: r.summary,
            councils: [...new Set(r.areas.map((a) => a.councilName))].slice(0, 4),
          }
          console.log(`[DEAL-PDF] backfilled Article 4: ${evidence.article4.status}`)
        } catch {
          // Fail-soft — the PDF keeps its legacy backendData fallback.
        }
      })(),
    ])
  }

  try {
    // Same scoring engine as the results page — identical numbers.
    const scoreResult = scoreDeal(
      buildScoringInput(data, results, backendData ?? undefined),
    )

    const [coverImage, floorplanImage, logoImage] = await Promise.all([
      fetchImageDataUri(body.images?.[0]),
      fetchImageDataUri(body.floorplans?.[0]),
      loadLogoDataUri(),
    ])

    const input: DealPackageInput = {
      data,
      results,
      backendData: backendData ?? null,
      scoreResult,
      refurbAnalysis: body.refurbAnalysis ?? null,
      evidence,
      coverImage,
      floorplanImage,
      logoImage,
      meta: {
        reportId,
        generatedAt,
        preparedFor: body.preparedFor ?? user.email ?? null,
      },
    }

    // renderToBuffer types expect ReactElement<DocumentProps>; our wrapper
    // component returns the <Document> — the runtime shape is correct.
    const element = React.createElement(DealPackageDocument, {
      input,
    }) as unknown as Parameters<typeof renderToBuffer>[0]
    const pdfBuffer = await renderToBuffer(element)

    // ── Analytics (best-effort — never blocks the download) ────────────
    try {
      const admin = createAdminClient()
      await admin.from("pdf_downloads").insert({
        user_id: user.id,
        report_id: reportId,
        strategy: data.investmentType,
        postcode: data.postcode ?? null,
        purchase_price: data.purchasePrice,
        deal_score: scoreResult.total,
        pdf_tier: gate.tier,
        file_size_kb: Math.round(pdfBuffer.length / 1024),
        pages: 8,
      })
    } catch (logErr) {
      console.warn(
        "[DEAL-PDF] download log failed:",
        logErr instanceof Error ? logErr.message : String(logErr),
      )
    }

    const postcode = (data.postcode ?? "UK").replace(/\s/g, "")
    const date = generatedAt.split("T")[0]
    const filename = `metalyzi-${postcode}-${date}.pdf`

    console.log(
      `[DEAL-PDF] generated ${filename} (${Math.round(pdfBuffer.length / 1024)}KB) for ${user.id} [${reportId}]`,
    )

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error(
      "[DEAL-PDF] generation failed:",
      err instanceof Error ? err.stack ?? err.message : String(err),
    )
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
  }
}
