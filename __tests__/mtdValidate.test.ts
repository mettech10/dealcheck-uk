import { describe, expect, test } from "vitest"
import {
  flaskMtdUrl,
  flaskPropertyLinkBody,
  isPlatformPropertyId,
  requirePlatformPropertyId,
} from "@/lib/mtd/config"
import { poundsToPence, requireAmountPence } from "@/lib/mtd/money"

describe("Flask MTD SoT helpers", () => {
  test("flaskMtdUrl targets canonical /v1/mtd", () => {
    expect(flaskMtdUrl("/health")).toMatch(/\/v1\/mtd\/health$/)
    expect(flaskMtdUrl("businesses")).toMatch(/\/v1\/mtd\/businesses$/)
    expect(flaskMtdUrl("/businesses/b1/ledger")).toMatch(/\/v1\/mtd\/businesses\/b1\/ledger$/)
  })

  test("P1: create/link requires a platform property UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111"
    expect(isPlatformPropertyId(id)).toBe(true)
    expect(requirePlatformPropertyId(id)).toBe(id)
    expect(() => requirePlatformPropertyId("14 Acacia")).toThrow(/propertyId is required/)
    expect(() => requirePlatformPropertyId("")).toThrow(/propertyId is required/)
  })

  test("property link payload passes propertyId through as property_id", () => {
    const propertyId = "11111111-1111-4111-8111-111111111111"
    expect(flaskPropertyLinkBody({ propertyId, label: "Manchester BTL" })).toEqual(
      expect.objectContaining({
        propertyId,
        property_id: propertyId,
        label: "Manchester BTL",
      }),
    )
  })

  test("amountPence is whole pence, not pounds", () => {
    expect(poundsToPence(12.5)).toBe(1250)
    expect(poundsToPence("1,250.00")).toBe(125000)
    expect(requireAmountPence(1250)).toBe(1250)
    expect(() => requireAmountPence(12.5)).toThrow(/whole pence/)
  })
})
