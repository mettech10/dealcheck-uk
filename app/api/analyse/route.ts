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

      // ── DIAGNOSTIC: Log full scrape payload ──
      console.log("[FLOOR-SIZE] SCRAPE RESPONSE - raw.sqft:", raw.sqft, "raw.sqm:", raw.sqm,
        "raw.floorArea:", raw.floorArea, "raw.internalArea:", raw.internalArea,
        "raw.squareFeet:", raw.squareFeet, "raw.sizeSqFeetMax:", raw.sizeSqFeetMax)
      console.log("[FLOOR-SIZE] SCRAPE RESPONSE - all keys:", Object.keys(raw).join(", "))

      // Resolve sqft: prefer scraped value, derive from sqm if needed
      let sqft = raw.sqft ? Number(raw.sqft) : undefined
      const sqm = raw.sqm ? Number(raw.sqm) : undefined
      if (!sqft && sqm) {
        sqft = Math.round(sqm * 10.764)
        console.log(`[FLOOR-SIZE] Derived sqft from sqm: ${sqm} sqm → ${sqft} sqft`)
      }
      console.log("[FLOOR-SIZE] After scrape extraction: sqft=", sqft, "sqm=", sqm)

      // If no floor size from listing, try EPC register
      // Requires EPC_API_TOKEN (Bearer token) — register free at:
      // https://get-energy-performance-data.communities.gov.uk
      let sqftSource: string | undefined
      if (!sqft && raw.postcode) {
        // New EPC API (migrated 2025): Bearer token auth
        // Accepts any of these env var names for flexibility
        const epcToken = process.env.EPC_API_TOKEN || process.env.EPC_TOKEN || process.env.EPC_BEARER_TOKEN || process.env.EPC_API_KEY || ""
        console.log("[FLOOR-SIZE] EPC API CALL - postcode:", raw.postcode,
          "EPC_API_TOKEN present:", !!process.env.EPC_API_TOKEN,
          "EPC_TOKEN present:", !!process.env.EPC_TOKEN,
          "EPC_BEARER_TOKEN present:", !!process.env.EPC_BEARER_TOKEN,
          "EPC_API_KEY present:", !!process.env.EPC_API_KEY,
          "EPC_API_EMAIL present:", !!process.env.EPC_API_EMAIL,
          "resolved token present:", !!epcToken)
        if (epcToken) {
          try {
            const epcUrl = `https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search?postcode=${encodeURIComponent(raw.postcode)}&page_size=5`
            console.log("[FLOOR-SIZE] EPC API URL:", epcUrl)
            const epcRes = await fetch(epcUrl, {
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${epcToken}`,
              },
              signal: AbortSignal.timeout(8000),
            })
            console.log("[FLOOR-SIZE] EPC RAW RESPONSE STATUS:", epcRes.status)
            if (epcRes.ok) {
              const epcData = await epcRes.json()
              // New API may use "rows", "results", or top-level array
              const rows = epcData?.rows || epcData?.results || (Array.isArray(epcData) ? epcData : [])
              console.log("[FLOOR-SIZE] EPC rows found:", rows.length)
              if (rows.length > 0) {
                console.log("[FLOOR-SIZE] EPC first row keys:", Object.keys(rows[0]).join(", "))
                console.log("[FLOOR-SIZE] EPC first row total-floor-area:", rows[0]["total-floor-area"],
                  "totalFloorArea:", rows[0].totalFloorArea,
                  "total_floor_area:", rows[0].total_floor_area,
                  "floorArea:", rows[0].floorArea)
                const epcSqm = Number(
                  rows[0]["total-floor-area"] ||
                  rows[0].totalFloorArea ||
                  rows[0].total_floor_area ||
                  rows[0].floorArea ||
                  0
                )
                if (epcSqm > 0) {
                  sqft = Math.round(epcSqm * 10.764)
                  sqftSource = "epc"
                  console.log(`[FLOOR-SIZE] EPC SUCCESS: ${epcSqm} sqm → ${sqft} sqft`)
                } else {
                  console.log("[FLOOR-SIZE] EPC row found but floor area is empty/zero:", epcSqm)
                }
              }
            } else {
              const errBody = await epcRes.text().catch(() => "")
              console.log(`[FLOOR-SIZE] EPC API returned ${epcRes.status} for postcode ${raw.postcode}:`, errBody.slice(0, 200))
            }
          } catch (epcErr) {
            console.log("[FLOOR-SIZE] EPC lookup EXCEPTION:", epcErr)
          }
        } else {
          console.log("[FLOOR-SIZE] EPC SKIPPED — no EPC token found in env. Set EPC_API_TOKEN or EPC_TOKEN.")
        }
      } else if (sqft) {
        console.log("[FLOOR-SIZE] EPC SKIPPED — sqft already available from scrape:", sqft)
      }
      if (sqft && !sqftSource) {
        sqftSource = "listing"
      }
      console.log("[FLOOR-SIZE] FINAL: sqft=", sqft, "sqftSource=", sqftSource)

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
      // Also forward the frontend's calculationResults so the backend can use
      // the exact same yield/cashflow figures for the benchmark comparison,
      // avoiding contradictions between headline metrics and benchmark panel.
      const response = await fetch(`${BACKEND_API_URL}/ai-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Passed as header so Flask can gate without touching the body
          "X-User-Email": userEmail,
        },
        body: JSON.stringify({
          ...propertyData,
          // Flask backend reads `dealType` (uppercase) but the Next.js form
          // carries `investmentType` (lowercase). Map the two so BRRRR deals
          // actually reach the BRR branch of the AI prompt.
          dealType: {
            btl: "BTL",
            brr: "BRR",
            hmo: "HMO",
            flip: "FLIP",
            r2sa: "R2SA",
            development: "DEV",
          }[(propertyData?.investmentType as string) || "btl"] || "BTL",
          userEmail,
          // Pass the frontend's calculated metrics so benchmark comparison
          // uses the same figures shown in the headline metrics cards
          _frontendMetrics: calculationResults
            ? {
                grossYield: calculationResults.grossYield,
                netYield: calculationResults.netYield,
                monthlyCashFlow: calculationResults.monthlyCashFlow,
                annualCashFlow: calculationResults.annualCashFlow,
                cashOnCashReturn: calculationResults.cashOnCashReturn,
                monthlyIncome: calculationResults.monthlyIncome,
                monthlyExpenses: calculationResults.monthlyExpenses,
              }
            : undefined,
          // FLIP-specific rich metrics from the Next.js engine. Flask AI
          // prompt reads these to replace its 5-line £0 placeholder with
          // the full UK 2024/25 Flip context (SDLT, bridging, CGT/CT,
          // 70% rule, deal score, post-tax ROI).
          flipComputed:
            propertyData?.investmentType === "flip" && calculationResults
              ? {
                  preTaxProfit:         calculationResults.flipPreTaxProfit,
                  postTaxProfit:        calculationResults.flipPostTaxProfit,
                  postTaxROI:           calculationResults.flipPostTaxROI,
                  taxType:              calculationResults.flipTaxType,
                  taxableGain:          calculationResults.flipTaxableGain,
                  taxLiability:         calculationResults.flipTaxLiability,
                  taxRateUsed:          calculationResults.flipTaxRateUsed,
                  dealScore:            calculationResults.flipDealScore,
                  dealScoreLabel:       calculationResults.flipDealScoreLabel,
                  passesSimple70:       calculationResults.flipPassesSimple70,
                  passesStrict70:       calculationResults.flipPassesStrict70,
                  simpleMAO:            calculationResults.flipSimpleMAO,
                  strictMAO:            calculationResults.flipStrictMAO,
                  percentOfARV:         calculationResults.flipPercentOfARV,
                  totalCapitalInvested: calculationResults.flipTotalCapitalInvested,
                  holdingCostsTotal:    calculationResults.flipHoldingCostsTotal,
                  exitCostsTotal:       calculationResults.flipExitCostsTotal,
                  financeTotal:         calculationResults.flipFinanceTotal,
                  refurbTotal:          calculationResults.flipRefurbTotal,
                  refurbContingency:    calculationResults.flipRefurbContingency,
                  holdingMonths:        calculationResults.flipHoldingMonths,
                  acquisitionCost:      calculationResults.flipAcquisitionCost,
                  arv:                  propertyData?.arv,
                }
              : undefined,
          // BRRRR-specific phase breakdown + 5-axis deal score. Flask AI
          // prompt consumes these to give BRR-tailored strengths/risks,
          // instead of generic BTL commentary.
          _brrrrContext:
            propertyData?.investmentType === "brr" && calculationResults
              ? {
                  arv: propertyData?.arv,
                  arvBasis: propertyData?.arvBasis,
                  // Phase costs
                  acquisitionCost: calculationResults.brrrrAcquisitionCost,
                  refurbBudget: calculationResults.brrrrRefurbBudget,
                  refurbContingency: calculationResults.brrrrRefurbContingency,
                  refurbHoldingCost: calculationResults.brrrrRefurbHoldingCost,
                  refurbTotal: calculationResults.brrrrRefurbTotal,
                  bridgingInterest: calculationResults.brrrrBridgingInterest,
                  bridgingFees: calculationResults.brrrrBridgingFees,
                  bridgingTotal: calculationResults.brrrrBridgingTotal,
                  refinanceArrangementFee:
                    calculationResults.brrrrRefinanceArrangementFee,
                  refinanceFees: calculationResults.brrrrRefinanceFees,
                  refinancedMortgage: calculationResults.refinancedMortgageAmount,
                  postRefinanceRate: calculationResults.brrrrPostRefinanceRate,
                  // Capital flow
                  totalCashInvested: calculationResults.brrrrTotalCashInvested,
                  capitalReturned: calculationResults.brrrrCapitalReturned,
                  moneyLeftInDeal: calculationResults.moneyLeftInDeal,
                  capitalRecycledPct:
                    calculationResults.brrrrCapitalRecycledPct,
                  // Uplift metrics
                  equityGained: calculationResults.equityGained,
                  refurbUpliftRatio:
                    calculationResults.brrrrRefurbUpliftRatio,
                }
              : undefined,
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
