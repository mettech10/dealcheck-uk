import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import { Footer } from "@/components/landing/footer"

test("footer marketing links target the homepage from any route", () => {
  const html = renderToStaticMarkup(React.createElement(Footer))
  for (const section of ["features", "how-it-works", "pricing"]) {
    expect(html).toContain(`href="/#${section}"`)
    expect(html).not.toContain(`href="#${section}"`)
  }
})
