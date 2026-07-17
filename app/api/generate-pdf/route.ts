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
      evidence: body.evidence ?? null,
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
