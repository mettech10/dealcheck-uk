import { streamText } from "ai"

export async function POST(req: Request) {
  const { propertyData, calculationResults } = await req.json()

  const result = streamText({
    model: "openai/gpt-4o-mini",
    system: `You are an expert UK property investment analyst. You analyse property deals for buy-to-let investors, landlords, and property professionals.

You provide clear, actionable analysis based on the financial metrics provided. You understand UK-specific concepts like SDLT, Section 24, HMO licensing, EPC requirements, and regional rental markets.

Your analysis should be structured, practical, and data-driven. Always be honest about risks.

Format your response exactly as follows:
1. Start with "Deal Score: X" where X is a number from 0-100
2. Then use markdown headings for each section

The deal score should be based on:
- Gross yield above 7% is excellent, 5-7% is good, below 5% is poor
- Positive monthly cash flow is essential, above £200/month is good
- Cash-on-cash ROI above 8% is excellent, 5-8% is good, below 5% is poor
- Net yield above 5% is excellent, 3-5% is good, below 3% is poor

Be realistic and UK-focused.`,
    prompt: `Analyse this UK property investment deal:

**Property Details:**
- Address: ${propertyData.address}
- Type: ${propertyData.propertyType}
- Bedrooms: ${propertyData.bedrooms}
- Condition: ${propertyData.condition}
- Purchase Price: £${propertyData.purchasePrice.toLocaleString()}

**Financing:**
- Method: ${propertyData.purchaseMethod}
${propertyData.purchaseMethod === "mortgage" ? `- Deposit: ${propertyData.depositPercentage}% (£${calculationResults.depositAmount.toLocaleString()})
- Mortgage Amount: £${calculationResults.mortgageAmount.toLocaleString()}
- Interest Rate: ${propertyData.interestRate}%
- Term: ${propertyData.mortgageTerm} years
- Type: ${propertyData.mortgageType}
- Monthly Mortgage: £${calculationResults.monthlyMortgagePayment.toLocaleString()}` : "- Cash purchase"}

**Calculated Metrics:**
- SDLT: £${calculationResults.sdltAmount.toLocaleString()} ${propertyData.isAdditionalProperty ? "(includes 5% surcharge)" : ""}
- Total Capital Required: £${calculationResults.totalCapitalRequired.toLocaleString()}
- Monthly Rent: £${propertyData.monthlyRent.toLocaleString()}
- Monthly Cash Flow: £${calculationResults.monthlyCashFlow.toLocaleString()}
- Annual Cash Flow: £${calculationResults.annualCashFlow.toLocaleString()}
- Gross Yield: ${calculationResults.grossYield}%
- Net Yield: ${calculationResults.netYield}%
- Cash-on-Cash ROI: ${calculationResults.cashOnCashReturn}%
- Void Period: ${propertyData.voidWeeks} weeks/year
- Management Fee: ${propertyData.managementFeePercent}%
- Annual Running Costs: £${calculationResults.annualRunningCosts.toLocaleString()}
${propertyData.refurbishmentBudget > 0 ? `- Refurbishment Budget: £${propertyData.refurbishmentBudget.toLocaleString()}` : ""}

**5-Year Projection (Year 5):**
- Projected Property Value: £${calculationResults.fiveYearProjection[4]?.propertyValue.toLocaleString() ?? "N/A"}
- Projected Equity: £${calculationResults.fiveYearProjection[4]?.equity.toLocaleString() ?? "N/A"}
- Cumulative Cash Flow: £${calculationResults.fiveYearProjection[4]?.cumulativeCashFlow.toLocaleString() ?? "N/A"}
- Total Return: £${calculationResults.fiveYearProjection[4]?.totalReturn.toLocaleString() ?? "N/A"}

Provide your analysis with the following sections:
1. Deal Score (0-100)
2. ## Summary - A 2-3 sentence overall assessment
3. ## Strengths - Bullet points of what makes this a good deal
4. ## Risks & Concerns - Bullet points of potential issues
5. ## Recommendation - Your final verdict and any suggestions to improve the deal`,
  })

  return result.toTextStreamResponse()
}
