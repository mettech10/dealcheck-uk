import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const BACKEND_API_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { mode } = body

    // ── Scrape-only mode: extract property data from a listing URL ──────────
    if (mode === "scrape-only") {
      const { url } = body
      if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 })
      }

      const response = await fetch(`${BACKEND_API_URL}/extract-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        return NextResponse.json(
          { error: data.message || "Failed to scrape listing" },
          { status: response.ok ? 400 : response.status }
        )
      }

      // Scrapers return snake_case fields; remap to the camelCase shape
      // that page.tsx expects under `propertyData`.
      const raw = data.data || {}

      // Resolve sqft: prefer scraped value, derive from sqm if needed
      let sqft = raw.sqft ? Number(raw.sqft) : undefined
      const sqm = raw.sqm ? Number(raw.sqm) : undefined
      if (!sqft && sqm) {
        sqft = Math.round(sqm * 10.764)
      }

      // If no floor size from listing, try EPC register
      // Requires EPC_API_EMAIL + EPC_API_KEY for Basic auth
      // Register free at: https://epc.opendatacommunities.org/login
      let sqftSource: string | undefined
      if (!sqft && raw.postcode) {
        const epcEmail = process.env.EPC_API_EMAIL || ""
        const epcKey = process.env.EPC_API_KEY || ""
        if (epcEmail && epcKey) {
          try {
            const basicAuth = Buffer.from(`${epcEmail}:${epcKey}`).toString("base64")
            const epcRes = await fetch(
              `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(raw.postcode)}&size=5`,
              {
                headers: {
                  Accept: "application/json",
                  Authorization: `Basic ${basicAuth}`,
                },
                signal: AbortSignal.timeout(5000),
              }
            )
            if (epcRes.ok) {
              const epcData = await epcRes.json()
              const rows = epcData?.rows || epcData?.results || []
              if (rows.length > 0) {
                const epcSqm = Number(rows[0]["total-floor-area"] || rows[0].totalFloorArea)
                if (epcSqm > 0) {
                  sqft = Math.round(epcSqm * 10.764)
                  sqftSource = "epc"
                  console.log(`[EPC] Floor size from EPC register: ${epcSqm} sqm → ${sqft} sqft`)
                }
              }
            } else {
              console.log(`[EPC] API returned ${epcRes.status} for postcode ${raw.postcode}`)
            }
          } catch {
            // EPC lookup failed — leave sqft undefined for manual entry
          }
        }
      }
      if (sqft && !sqftSource) {
        sqftSource = "listing"
      }

      // Map property type detail from scraper to form enum
      const rawType = (raw.propertyType || raw.property_type || "").toLowerCase()
      let propertyTypeDetail: string | undefined
      if (rawType.includes("terrace") && rawType.includes("end")) propertyTypeDetail = "end-of-terrace"
      else if (rawType.includes("terrace")) propertyTypeDetail = "terraced"
      else if (rawType.includes("semi")) propertyTypeDetail = "semi-detached"
      else if (rawType.includes("detach")) propertyTypeDetail = "detached"
      else if (rawType.includes("flat") || rawType.includes("apartment")) propertyTypeDetail = "flat-apartment"
      else if (rawType.includes("bungalow")) propertyTypeDetail = "bungalow"
      else if (rawType.includes("maisonette")) propertyTypeDetail = "maisonette"

      // Map broad property type for calculations
      const broadType = ["flat-apartment", "maisonette"].includes(propertyTypeDetail || "")
        ? "flat"
        : "house"

      // Map tenure type
      const rawTenure = (raw.tenure_type || raw.tenureType || "").toLowerCase()
      let tenureType: string | undefined
      if (rawTenure.includes("freehold")) tenureType = "freehold"
      else if (rawTenure.includes("leasehold")) tenureType = "leasehold"

      return NextResponse.json({
        success: true,
        propertyData: {
          address: raw.address || "",
          postcode: raw.postcode || "",
          purchasePrice: Number(raw.price || raw.purchasePrice) || 0,
          propertyType: broadType,
          ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
          bedrooms: raw.bedrooms ? Number(raw.bedrooms) : undefined,
          ...(raw.bathrooms ? { bathrooms: Number(raw.bathrooms) } : {}),
          ...(sqft ? { sqft } : {}),
          ...(sqm ? { sqm } : {}),
          ...(sqftSource ? { sqftSource } : {}),
          ...(tenureType ? { tenureType } : {}),
          ...(tenureType === "leasehold" && raw.lease_years ? { leaseYears: Number(raw.lease_years) } : {}),
          ...(tenureType === "leasehold" && raw.leaseYears ? { leaseYears: Number(raw.leaseYears) } : {}),
          // Pass through listing display data
          description: raw.description || undefined,
          keyFeatures: raw.key_features || raw.keyFeatures || undefined,
          images: raw.images || undefined,
          floorplans: raw.floorplans || undefined,
          agentName: raw.agent_name || raw.agentName || undefined,
          agentPhone: raw.agent_phone || raw.agentPhone || undefined,
          agentAddress: raw.agent_address || raw.agentAddress || undefined,
          listingUrl: raw.listing_url || raw.listingUrl || url,
          source: raw.source || undefined,
          councilTaxBand: raw.council_tax_band || raw.councilTaxBand || undefined,
        },
      })
    }

    // ── Manual mode: run AI analysis on submitted property data ─────────────
    if (mode === "manual") {
      const { propertyData, calculationResults } = body

      if (!propertyData?.purchasePrice) {
        return NextResponse.json(
          { error: "purchasePrice is required" },
          { status: 400 }
        )
      }

      // Get the authenticated user's email for the subscription gate
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const userEmail = user?.email || ""

      // Flask /ai-analyze expects flat camelCase property fields directly in
      // the request body, not nested under propertyData.
      const response = await fetch(`${BACKEND_API_URL}/ai-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Passed as header so Flask can gate without touching the body
          "X-User-Email": userEmail,
        },
        body: JSON.stringify({
          ...propertyData,
          userEmail,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Preserve the subscription_required code so page.tsx can show the
        // correct upgrade prompt.
        if (data.code === "subscription_required") {
          return NextResponse.json(data, { status: 403 })
        }
        return NextResponse.json(
          { error: data.message || "Analysis failed" },
          { status: response.status }
        )
      }

      if (!data.success) {
        return NextResponse.json(
          { error: data.message || "Analysis failed" },
          { status: 400 }
        )
      }

      // Flask returns { success: true, results: { ...metrics, ai_verdict, ... } }
      // page.tsx expects { structured: { ... } } and calls formatAnalysisResults()
      // on the structured object to render the text view.
      return NextResponse.json({ structured: data.results })
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (error) {
    console.error("[API] /api/analyse error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
