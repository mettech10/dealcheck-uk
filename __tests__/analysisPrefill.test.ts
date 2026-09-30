import { expect, test } from "vitest"
import { sdltAnalysisLink, readSdltPrefill } from "@/lib/analysis-prefill"
import { calculateInvestmentSDLT } from "@/lib/calculations"

test.each(["non-residential", "mixed-use"] as const)("%s retains £7,000 SDLT through the analysis handoff", (rate) => {
  const link = new URL(sdltAnalysisLink(350000, "additional", rate), "https://metalyzi.test")
  const prefill = readSdltPrefill(link.searchParams)!
  expect(prefill).toEqual({ purchasePrice: 350000, buyerType: "additional", sdltRateType: rate })
  expect(calculateInvestmentSDLT(prefill.purchasePrice!, prefill.buyerType!, prefill.sdltRateType).total).toBe(7000)
})
test.each(["", "purchasePrice=-1", "purchasePrice=NaN", "purchasePrice=Infinity"])("invalid price does not prefill: %s", (query) => {
  expect(readSdltPrefill(new URLSearchParams(query))).toBeNull()
})
