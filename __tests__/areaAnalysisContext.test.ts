import { expect, test } from "vitest"
import { areaAnalysisContext } from "@/lib/area-analysis-context"
import type { BackendResults } from "@/lib/types"

test("area narrative receives the same comps, Article 4 and benchmark as the page", () => {
  const context = areaAnalysisContext({ regional_benchmark: { regional_median_yield: 4.75 } } as BackendResults, {
    soldComps: [{ address: "QA comparable", price: 240958 }], soldAverage: 240958,
    article4: { status: "active", councils: ["Manchester"] },
  })
  expect(context.benchmark.gross_yield_median).toBe(4.75)
  expect(context.marketContext.soldComparables).toHaveLength(1)
  expect(context.marketContext.avgSoldPrice).toBe(240958)
  expect(context.articleFour).toMatchObject({ is_article_4: true, known: true, council: "Manchester" })
})
test("unknown live planning result never falls back to old legal clearance", () => {
  const context = areaAnalysisContext({ article_4: { is_article_4: false, known: true } }, { article4: { status: "unknown" } })
  expect(context.articleFour?.known).toBe(false)
})
