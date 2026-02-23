export async function POST(req: Request) {
  const body = await req.json()
  const { mode } = body

  // Flask backend URL (Metusa Deal Analyzer)
  const flaskUrl = process.env.FLASK_API_URL || "http://127.0.0.1:5000"

  console.log("[DealCheck] Flask URL:", flaskUrl)
  console.log("[DealCheck] Request mode:", mode)

  // ── URL Mode: Scrape and analyse a listing URL ──────────────
  if (mode === "url") {
    const { url } = body

    if (!url || typeof url !== "string") {
      return Response.json(
        { error: "A valid property listing URL is required." },
        { status: 400 }
      )
    }

    try {
      // Step 1: Extract property data from URL using Flask backend
      console.log("[DealCheck] Extracting URL:", url)
      
      const extractRes = await fetch(`${flaskUrl}/extract-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      })

      if (!extractRes.ok) {
        const err = await extractRes.json()
        return Response.json(
          { error: err.message || "Failed to extract property data from URL" },
          { status: 400 }
        )
      }

      const extractedData = await extractRes.json()
      console.log("[DealCheck] Extracted data:", extractedData)

      if (!extractedData.success) {
        return Response.json(
          { error: extractedData.message || "Could not extract data from URL" },
          { status: 400 }
        )
      }

      // Step 2: Get AI analysis from Flask backend
      // Build property data for analysis
      const propertyData = {
        address: extractedData.data?.address || "Unknown",
        postcode: extractedData.data?.postcode || "",
        dealType: "BTL",
        purchasePrice: extractedData.data?.price || 0,
        monthlyRent: 0, // Will need to estimate or ask user
        bedrooms: extractedData.data?.bedrooms || 3,
        propertyType: extractedData.data?.property_type || "Unknown"
      }

      // Call AI analysis endpoint
      const analysisRes = await fetch(`${flaskUrl}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propertyData)
      })

      if (!analysisRes.ok) {
        const err = await analysisRes.json()
        return Response.json(
          { error: err.message || "AI analysis failed" },
          { status: 500 }
        )
      }

      const analysisData = await analysisRes.json()
      console.log("[DealCheck] AI analysis:", analysisData)

      if (!analysisData.success) {
        return Response.json(
          { error: analysisData.message || "Analysis failed" },
          { status: 500 }
        )
      }

      // Format response for frontend
      const results = analysisData.results
      
      const analysisText = `
**Deal Score: ${results.deal_score || 'N/A'}/100**

## Summary
${results.ai_verdict || 'Analysis not available'}

## Property Details
- **Address:** ${propertyData.address}
- **Price:** £${Number(propertyData.purchasePrice).toLocaleString()}
- **Type:** ${propertyData.propertyType}
- **Bedrooms:** ${propertyData.bedrooms}

## Financial Metrics
- **Gross Yield:** ${results.gross_yield?.toFixed(2) || 'N/A'}%
- **Net Yield:** ${results.net_yield?.toFixed(2) || 'N/A'}%
- **Monthly Cashflow:** £${results.monthly_cashflow?.toFixed(0) || 'N/A'}
- **Cash-on-Cash ROI:** ${results.cash_on_cash?.toFixed(2) || 'N/A'}%
- **Stamp Duty:** £${results.stamp_duty?.toLocaleString() || 'N/A'}

## Strengths
${results.ai_strengths || 'Not available'}

## Risks & Concerns
${results.ai_risks || 'Not available'}

## Recommendation
${results.ai_next_steps || 'Not available'}

## Area Assessment
${results.ai_area || 'Not available'}
`

      return Response.json({
        aiAnalysis: analysisText,
        extractedData: extractedData.data,
        raw: results
      })

    } catch (err) {
      console.error("[DealCheck] URL analysis error:", err)
      const message = err instanceof Error ? err.message : "Unknown error"
      return Response.json(
        { error: `Analysis failed: ${message}` },
        { status: 500 }
      )
    }
  }

  // ── Manual Mode: Analyse property data with calculations ────────────
  if (mode === "manual") {
    const { propertyData, calculationResults } = body

    if (!propertyData || !calculationResults) {
      return Response.json(
        { error: "Property data and calculation results are required." },
        { status: 400 }
      )
    }

    try {
      console.log("[DealCheck] Manual analysis for:", propertyData.address)

      // Call Flask backend AI analysis
      const analysisRes = await fetch(`${flaskUrl}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: propertyData.address,
          postcode: propertyData.postcode,
          dealType: propertyData.purchaseMethod === "mortgage" ? "BTL" : "CASH",
          purchasePrice: Number(propertyData.purchasePrice),
          monthlyRent: Number(propertyData.monthlyRent),
          bedrooms: Number(propertyData.bedrooms) || 3,
          deposit: propertyData.depositPercentage,
          interestRate: propertyData.interestRate,
          isAdditionalProperty: propertyData.isAdditionalProperty
        })
      })

      if (!analysisRes.ok) {
        const err = await analysisRes.json()
        return Response.json(
          { error: err.message || "AI analysis failed" },
          { status: 500 }
        )
      }

      const analysisData = await analysisRes.json()
      console.log("[DealCheck] Manual analysis result:", analysisData)

      if (!analysisData.success) {
        return Response.json(
          { error: analysisData.message || "Analysis failed" },
          { status: 500 }
        )
      }

      const results = analysisData.results

      // Format comprehensive analysis
      const analysisText = `
**Deal Score: ${results.deal_score || 'N/A'}/100 | Verdict: ${results.verdict || 'REVIEW'}**

## Summary
${results.ai_verdict || 'Analysis not available'}

## Property Details
- **Address:** ${propertyData.address || 'Not specified'}
- **Type:** ${propertyData.propertyType || 'Unknown'}
- **Bedrooms:** ${propertyData.bedrooms || 'Unknown'}
- **Purchase Price:** £${Number(propertyData.purchasePrice).toLocaleString()}

## Financing
${propertyData.purchaseMethod === "mortgage" 
  ? `- **Deposit:** ${propertyData.depositPercentage}% (£${Number(calculationResults.depositAmount).toLocaleString()})
- **Mortgage:** £${Number(calculationResults.mortgageAmount).toLocaleString()} at ${propertyData.interestRate}%
- **Monthly Payment:** £${Number(calculationResults.monthlyMortgagePayment).toLocaleString()}`
  : '- **Cash Purchase**'}

## Calculated Metrics
- **SDLT:** £${Number(calculationResults.sdltAmount).toLocaleString()} ${propertyData.isAdditionalProperty ? "(includes 5% surcharge)" : ""}
- **Total Capital Required:** £${Number(calculationResults.totalCapitalRequired).toLocaleString()}
- **Monthly Rent:** £${Number(propertyData.monthlyRent).toLocaleString()}
- **Monthly Cash Flow:** £${Number(calculationResults.monthlyCashFlow).toLocaleString()}
- **Annual Cash Flow:** £${Number(calculationResults.annualCashFlow).toLocaleString()}
- **Gross Yield:** ${calculationResults.grossYield}%
- **Net Yield:** ${calculationResults.netYield}%
- **Cash-on-Cash ROI:** ${calculationResults.cashOnCashReturn}%

## Strengths
${results.ai_strengths || 'Not available'}

## Risks & Concerns
${results.ai_risks || 'Not available'}

## Recommendation
${results.ai_next_steps || 'Not available'}

## Area Assessment
${results.ai_area || 'Not available'}
`

      return Response.json({
        aiAnalysis: analysisText,
        raw: results
      })

    } catch (err) {
      console.error("[DealCheck] Manual analysis error:", err)
      const message = err instanceof Error ? err.message : "Unknown error"
      return Response.json(
        { error: `Analysis failed: ${message}` },
        { status: 500 }
      )
    }
  }

  return Response.json({ error: "Invalid mode. Use 'url' or 'manual'." }, { status: 400 })
}
