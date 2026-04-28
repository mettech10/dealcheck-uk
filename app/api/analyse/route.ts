import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkArticle4 } from "@/lib/article4-service"

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

      // If no floor size from listing, try the gov.uk EPC register.
      //
      // ⚠ Floor-area availability (as of Apr 2026):
      //   The new https://api.get-energy-performance-data.communities.gov.uk
      //   service exposes /api/domestic/search returning a slim payload of
      //   address + energy band + UPRN — it does NOT include total-floor-area.
      //   Empirically tested with a real OL4 4QT postcode: returns 200 with
      //   `{ data: [...] }` and the row schema is:
      //     certificateNumber, addressLine1-4, postcode, postTown, council,
      //     constituency, currentEnergyEfficiencyBand, registrationDate, uprn
      //   No certificate-detail endpoint is reachable yet (all variants return
      //   404). Until DLUHC ships a detail endpoint, the scraper is the
      //   authoritative source for floor area; EPC remains useful for energy
      //   band, address validation, and presence-of-certificate signal.
      //
      // The lookup below is future-proofed: when the detail endpoint lands and
      // search rows include floor-area (or a follow-up call is supported),
      // the parser will pick up `total-floor-area`, `totalFloorArea`,
      // `total_floor_area`, or `floorArea` automatically.
      //
      // Token: set EPC_API_TOKEN in Render env. Register free at
      // https://get-energy-performance-data.communities.gov.uk
      let sqftSource: string | undefined
      if (!sqft && raw.postcode) {
        const epcToken = process.env.EPC_API_TOKEN || process.env.EPC_TOKEN || process.env.EPC_BEARER_TOKEN || process.env.EPC_API_KEY || ""
        console.log("[FLOOR-SIZE] EPC API CALL - postcode:", raw.postcode,
          "tokenPresent:", !!epcToken)
        if (epcToken) {
          try {
            const epcUrl = `https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search?postcode=${encodeURIComponent(raw.postcode)}&size=5`
            const epcRes = await fetch(epcUrl, {
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${epcToken}`,
              },
              signal: AbortSignal.timeout(8000),
            })
            console.log("[FLOOR-SIZE] EPC API status:", epcRes.status)
            if (epcRes.ok) {
              const epcData = await epcRes.json()
              // gov.uk service wraps results in `data`. Older mirrors used
              // `rows`/`results`, so we accept all three shapes.
              const rows: Record<string, unknown>[] =
                epcData?.data ||
                epcData?.rows ||
                epcData?.results ||
                (Array.isArray(epcData) ? epcData : [])
              console.log("[FLOOR-SIZE] EPC rows found:", rows.length)
              if (rows.length > 0) {
                const r = rows[0] as Record<string, unknown>
                const epcSqm = Number(
                  (r["total-floor-area"] as number | undefined) ||
                  (r["totalFloorArea"] as number | undefined) ||
                  (r["total_floor_area"] as number | undefined) ||
                  (r["floorArea"] as number | undefined) ||
                  0
                )
                if (epcSqm > 0) {
                  sqft = Math.round(epcSqm * 10.764)
                  sqftSource = "epc"
                  console.log(`[FLOOR-SIZE] EPC SUCCESS: ${epcSqm} sqm → ${sqft} sqft`)
                } else {
                  console.log(
                    "[FLOOR-SIZE] EPC certificate found but no floor-area field in response — current gov.uk search API does not include floor area. Falling back to scraper."
                  )
                }
              }
            } else if (epcRes.status === 404) {
              // Normal "no certificates" response — not a real error
              console.log(`[FLOOR-SIZE] EPC: no certificates registered for ${raw.postcode}`)
            } else {
              const errBody = await epcRes.text().catch(() => "")
              console.log(
                `[FLOOR-SIZE] EPC API returned ${epcRes.status} for ${raw.postcode}:`,
                errBody.slice(0, 200)
              )
            }
          } catch (epcErr) {
            console.log("[FLOOR-SIZE] EPC lookup EXCEPTION:", epcErr)
          }
        } else {
          console.log("[FLOOR-SIZE] EPC SKIPPED — no EPC_API_TOKEN in env")
        }
      } else if (sqft) {
        console.log("[FLOOR-SIZE] EPC SKIPPED — sqft already from scrape:", sqft)
      }
      if (sqft && !sqftSource) {
        sqftSource = "listing"
      }

      // Heuristic fallback — when neither the scraper nor EPC supplied a
      // floor size, derive a best-guess from bedrooms + property type
      // using UK industry averages. Always estimate something so the
      // analysis isn't blocked; the form labels the source so the user
      // knows to verify. Source values: "listing" | "epc" | "estimated".
      //
      // Averages drawn from RICS / NHBC residential-size benchmarks.
      // Apartments smaller than houses; bedroom count is the dominant
      // signal.
      if (!sqft) {
        const bedrooms = Number(raw.bedrooms) || 0
        const ptype = (raw.propertyType || raw.property_type || "").toLowerCase()
        const isFlat =
          ptype.includes("flat") ||
          ptype.includes("apartment") ||
          ptype.includes("maisonette")
        const isDetached = ptype.includes("detach") && !ptype.includes("semi")
        // Look-up table: estimated sqft by bedrooms × property type bucket.
        // Falls through to the generic "house" column when type unknown.
        const ESTIMATES: Record<number, { flat: number; semi: number; detached: number; house: number }> = {
          0: { flat: 270, semi: 350, detached: 400, house: 350 },   // studio
          1: { flat: 495, semi: 560, detached: 700, house: 560 },
          2: { flat: 624, semi: 775, detached: 950, house: 775 },
          3: { flat: 800, semi: 1001, detached: 1200, house: 947 },
          4: { flat: 1050, semi: 1200, detached: 1500, house: 1300 },
          5: { flat: 1300, semi: 1500, detached: 1900, house: 1700 },
          6: { flat: 1500, semi: 1700, detached: 2200, house: 2000 },
        }
        const row = ESTIMATES[Math.min(Math.max(bedrooms, 0), 6)] || ESTIMATES[3]
        const est = isFlat ? row.flat : isDetached ? row.detached : ptype.includes("semi") ? row.semi : row.house
        if (est && bedrooms > 0) {
          sqft = est
          sqftSource = "estimated"
          console.log(
            `[FLOOR-SIZE] HEURISTIC: ${bedrooms} bed ${ptype || "house"} → ${est} sqft (estimate, user should verify)`
          )
        } else {
          console.log("[FLOOR-SIZE] No data available for heuristic — bedrooms unknown")
        }
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

      // Article 4 engine lookup — runs server-side against Supabase so the
      // Flask AI prompt gets the same 3-state view the result card shows.
      // Fail-soft: if the table is missing or the postcode is unparseable
      // we forward a minimal "unknown" shape, never block analysis.
      let article4Engine:
        | {
            isArticle4: boolean
            status: "active" | "proposed" | "none" | "unknown"
            warningLevel: "red" | "amber" | "none"
            summary: string
            district: string | null
            sector: string | null
            areas: Array<{
              councilName: string
              directionType: string | null
              effectiveDate: string | null
              consultationEndDate: string | null
              impactDescription: string | null
              councilPlanningUrl: string | null
              dataSource: string | null
              status: string
            }>
          }
        | undefined
      try {
        if (propertyData?.postcode) {
          const admin = createAdminClient()
          const a4 = await checkArticle4(admin, propertyData.postcode)
          article4Engine = {
            isArticle4: a4.isArticle4,
            status: a4.status,
            warningLevel: a4.warningLevel,
            summary: a4.summary,
            district: a4.district,
            sector: a4.sector,
            areas: a4.areas.map((a) => ({
              councilName: a.councilName,
              directionType: a.directionType,
              effectiveDate: a.effectiveDate,
              consultationEndDate: a.consultationEndDate,
              impactDescription: a.impactDescription,
              councilPlanningUrl: a.councilPlanningUrl,
              dataSource: a.dataSource,
              status: a.status,
            })),
          }
        }
      } catch (err) {
        console.warn("[api/analyse] article4 engine lookup failed:", err)
      }

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
                sdltAmount: calculationResults.sdltAmount,
                totalCapitalRequired: calculationResults.totalCapitalRequired,
                depositAmount: calculationResults.depositAmount,
                mortgageAmount: calculationResults.mortgageAmount,
                monthlyMortgagePayment: calculationResults.monthlyMortgagePayment,
                annualMortgageCost: calculationResults.annualMortgageCost,
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
          // Article 4 engine snapshot — threaded into the Flask AI prompt
          // so HMO analyses reference the Metalyzi Supabase dataset
          // (council, direction type, effective date, impact, source) and
          // not just the Flask-side hardcoded fallback.
          _article4Engine: article4Engine,
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
          // Property Development feasibility appraisal — threaded into the
          // Flask AI prompt so DEV analyses get full GDV / TDC / cost-stack /
          // RLV / leverage / IRR context, plus the engine's viability flags
          // and deal score, instead of generic BTL commentary.
          _devContext:
            propertyData?.investmentType === "development" &&
            calculationResults?.development
              ? calculationResults.development
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
