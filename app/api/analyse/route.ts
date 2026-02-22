export async function POST(req: Request) {
  const body = await req.json()
  const { mode } = body

  const openclawUrl = process.env.OPENCLAW_API_URL
  const openclawKey = process.env.OPENCLAW_API_KEY

  console.log("[v0] OpenClaw URL:", openclawUrl)
  console.log("[v0] OpenClaw Key present:", !!openclawKey)
  console.log("[v0] Request mode:", mode)

  if (!openclawUrl) {
    return Response.json(
      { error: "OpenClaw API URL is not configured. Please set OPENCLAW_API_URL in environment variables." },
      { status: 500 }
    )
  }

  // Validate the URL format
  try {
    new URL(openclawUrl)
  } catch {
    return Response.json(
      { error: `OPENCLAW_API_URL is not a valid URL: "${openclawUrl}". Please check your environment variables.` },
      { status: 500 }
    )
  }

  // ── URL Mode: Forward listing URL to OpenClaw ──────────────────────
  if (mode === "url") {
    const { url } = body

    if (!url || typeof url !== "string") {
      return Response.json(
        { error: "A valid property listing URL is required." },
        { status: 400 }
      )
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      const openclawRes = await fetch(openclawUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openclawKey ? { Authorization: `Bearer ${openclawKey}` } : {}),
        },
        body: JSON.stringify({
          mode: "url",
          url,
          instructions:
            "Analyse this UK property listing URL. Extract the property details (address, price, bedrooms, type, etc.) and provide a full investment analysis including: Deal Score (0-100), Summary, Strengths, Risks & Concerns, and Recommendation. Calculate or estimate SDLT, mortgage costs, rental yield, cash flow, and ROI where possible.",
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!openclawRes.ok) {
        const errText = await openclawRes.text().catch(() => "Unknown error")
        return Response.json(
          { error: `OpenClaw returned an error: ${errText}` },
          { status: openclawRes.status }
        )
      }

      // Check if OpenClaw returns a stream or JSON
      const contentType = openclawRes.headers.get("content-type") || ""

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Stream the response through to the client
        return new Response(openclawRes.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
          },
        })
      }

      // JSON response
      const data = await openclawRes.json()
      return Response.json(data)
    } catch (err) {
      console.error("[v0] OpenClaw URL mode fetch error:", err)
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request to OpenClaw timed out after 60 seconds. The service may be busy -- please try again."
          : err instanceof Error
            ? `Failed to connect to OpenClaw: ${err.message}`
            : "Failed to connect to OpenClaw. Please check your API configuration."
      return Response.json({ error: message }, { status: 502 })
    }
  }

  // ── Manual Mode: Forward property data + calculations to OpenClaw ──
  if (mode === "manual") {
    const { propertyData, calculationResults } = body

    if (!propertyData || !calculationResults) {
      return Response.json(
        { error: "Property data and calculation results are required." },
        { status: 400 }
      )
    }

    // Build a detailed prompt payload for OpenClaw
    const analysisPayload = {
      mode: "manual",
      propertyData,
      calculationResults,
      instructions: `Analyse this UK property investment deal:

**Property Details:**
- Address: ${propertyData.address}
- Type: ${propertyData.propertyType}
- Bedrooms: ${propertyData.bedrooms}
- Condition: ${propertyData.condition}
- Purchase Price: £${Number(propertyData.purchasePrice).toLocaleString()}

**Financing:**
- Method: ${propertyData.purchaseMethod}
${
  propertyData.purchaseMethod === "mortgage"
    ? `- Deposit: ${propertyData.depositPercentage}% (£${Number(calculationResults.depositAmount).toLocaleString()})
- Mortgage Amount: £${Number(calculationResults.mortgageAmount).toLocaleString()}
- Interest Rate: ${propertyData.interestRate}%
- Term: ${propertyData.mortgageTerm} years
- Type: ${propertyData.mortgageType}
- Monthly Mortgage: £${Number(calculationResults.monthlyMortgagePayment).toLocaleString()}`
    : "- Cash purchase"
}

**Calculated Metrics:**
- SDLT: £${Number(calculationResults.sdltAmount).toLocaleString()} ${propertyData.isAdditionalProperty ? "(includes 5% surcharge)" : ""}
- Total Capital Required: £${Number(calculationResults.totalCapitalRequired).toLocaleString()}
- Monthly Rent: £${Number(propertyData.monthlyRent).toLocaleString()}
- Monthly Cash Flow: £${Number(calculationResults.monthlyCashFlow).toLocaleString()}
- Annual Cash Flow: £${Number(calculationResults.annualCashFlow).toLocaleString()}
- Gross Yield: ${calculationResults.grossYield}%
- Net Yield: ${calculationResults.netYield}%
- Cash-on-Cash ROI: ${calculationResults.cashOnCashReturn}%
- Void Period: ${propertyData.voidWeeks} weeks/year
- Management Fee: ${propertyData.managementFeePercent}%
- Annual Running Costs: £${Number(calculationResults.annualRunningCosts).toLocaleString()}
${Number(propertyData.refurbishmentBudget) > 0 ? `- Refurbishment Budget: £${Number(propertyData.refurbishmentBudget).toLocaleString()}` : ""}

**5-Year Projection (Year 5):**
- Projected Property Value: £${Number(calculationResults.fiveYearProjection?.[4]?.propertyValue ?? 0).toLocaleString()}
- Projected Equity: £${Number(calculationResults.fiveYearProjection?.[4]?.equity ?? 0).toLocaleString()}
- Cumulative Cash Flow: £${Number(calculationResults.fiveYearProjection?.[4]?.cumulativeCashFlow ?? 0).toLocaleString()}
- Total Return: £${Number(calculationResults.fiveYearProjection?.[4]?.totalReturn ?? 0).toLocaleString()}

Provide your analysis with:
1. Deal Score: X (0-100)
2. ## Summary
3. ## Strengths
4. ## Risks & Concerns
5. ## Recommendation`,
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      const openclawRes = await fetch(openclawUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openclawKey ? { Authorization: `Bearer ${openclawKey}` } : {}),
        },
        body: JSON.stringify(analysisPayload),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!openclawRes.ok) {
        const errText = await openclawRes.text().catch(() => "Unknown error")
        return Response.json(
          { error: `OpenClaw returned an error: ${errText}` },
          { status: openclawRes.status }
        )
      }

      const contentType = openclawRes.headers.get("content-type") || ""

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        return new Response(openclawRes.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
          },
        })
      }

      const data = await openclawRes.json()
      return Response.json(data)
    } catch (err) {
      console.error("[v0] OpenClaw manual mode fetch error:", err)
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request to OpenClaw timed out after 60 seconds. The service may be busy -- please try again."
          : err instanceof Error
            ? `Failed to connect to OpenClaw: ${err.message}`
            : "Failed to connect to OpenClaw. Please check your API configuration."
      return Response.json({ error: message }, { status: 502 })
    }
  }

  return Response.json({ error: "Invalid mode. Use 'url' or 'manual'." }, { status: 400 })
}
