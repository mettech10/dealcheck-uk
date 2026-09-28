import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import { PropertyForm } from "@/components/analyse/property-form"
import { FormField, FieldInput } from "@/components/analyse/form-field"

test("every initial numeric property input references a rendered visible label", () => {
  const html = renderToStaticMarkup(React.createElement(PropertyForm, { onSubmit: vi.fn(), isLoading: false }))
  const inputs = html.match(/<input\b[^>]*type="number"[^>]*>/g) || []
  expect(inputs.length).toBeGreaterThanOrEqual(18)
  for (const input of inputs) {
    const labelId = input.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(labelId, input).toBeTruthy()
    expect(html).toContain(`id="${labelId}"`)
  }
})

test("field error is connected to its input and marks it invalid", () => {
  const html = renderToStaticMarkup(React.createElement(FormField, { label: "Rent", error: "Enter a positive rent", children: React.createElement(FieldInput, { type: "number" }) }))
  const input = html.match(/<input\b[^>]*>/)![0]
  const descriptionId = input.match(/aria-describedby="([^"]+)"/)?.[1]
  expect(input).toContain('aria-invalid="true"')
  expect(html).toContain(`id="${descriptionId}"`)
  expect(html).toContain("Enter a positive rent")
})
test("manual floor area is not presented as a listing or EPC measurement", () => {
  const html = renderToStaticMarkup(React.createElement(PropertyForm, { onSubmit: vi.fn(), isLoading: false, defaultValues: { sqft: 1000 } }))
  expect(html).toContain("Floor size entered by you")
  expect(html).not.toContain("From listing or EPC certificate")
})
