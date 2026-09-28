import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import { AnalysisPreview } from "@/components/landing/analysis-preview"

test("homepage sample shows the correct additional-property SDLT for £215,000", () => {
  const html = renderToStaticMarkup(React.createElement(AnalysisPreview))
  expect(html).toContain("£215,000")
  expect(html).toContain("£12,550")
  expect(html).not.toContain("£8,750")
})
