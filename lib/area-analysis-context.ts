import type { BackendResults } from "./types"
import type { DealPdfEvidence } from "./pdfEvidence"

/** Give the narrative the evidence displayed on the current results page. */
export function areaAnalysisContext(backend: BackendResults | null | undefined, evidence: DealPdfEvidence) {
  const local = backend?.postcode_benchmark
  const regional = backend?.regional_benchmark
  const article4 = evidence.article4
  return {
    benchmark: {
      ...regional, ...local,
      gross_yield_median: local?.gross_yield_median ?? regional?.regional_median_yield,
    },
    articleFour: article4 ? {
      is_article_4: article4.status === "active",
      known: article4.status === "active" || article4.status === "none",
      status: article4.status,
      council: article4.councils?.join(", ") || backend?.article_4?.council,
      note: article4.summary,
    } : backend?.article_4,
    marketContext: {
      soldComparables: evidence.soldComps ?? backend?.sold_comparables ?? null,
      rentComparables: evidence.rentalComps ?? backend?.rent_comparables ?? null,
      avgSoldPrice: evidence.soldAverage ?? backend?.avg_sold_price ?? null,
      houseValuation: backend?.house_valuation ?? null,
    },
  }
}
