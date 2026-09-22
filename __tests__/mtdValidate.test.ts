import { describe, expect, test } from "vitest"
import {
  DEFAULT_ANALYZER_API_URL,
  analyzerEnvSource,
  analyzerMissingEnvMessage,
  analyzerUnreachableMessage,
  flaskMtdUrl,
  flaskPropertyLinkBody,
  isPlatformPropertyId,
  mtdBffUrl,
  requirePlatformPropertyId,
} from "@/lib/mtd/config"
import { poundsToPence, requireAmountPence } from "@/lib/mtd/money"

describe("Flask MTD SoT helpers", () => {
  test("flaskMtdUrl targets canonical /v1/mtd", () => {
    expect(flaskMtdUrl("/health")).toMatch(/\/v1\/mtd\/health$/)
    expect(flaskMtdUrl("businesses")).toMatch(/\/v1\/mtd\/businesses$/)
    expect(flaskMtdUrl("/businesses/b1/ledger")).toMatch(/\/v1\/mtd\/businesses\/b1\/ledger$/)
  })

  test("mtdBffUrl is same-origin /api/mtd (browser never hits Flask)", () => {
    expect(mtdBffUrl("/businesses")).toBe("/api/mtd/businesses")
    expect(mtdBffUrl("businesses/b1/ledger")).toBe("/api/mtd/businesses/b1/ledger")
  })

  test("analyzer env uses explicit ANALYZER_API_URL over the default", () => {
    const src = analyzerEnvSource({
      ANALYZER_API_URL: "https://analyzer.example.test/",
      NEXT_PUBLIC_ANALYZER_API_URL: "https://public.example.test",
    })
    expect(src).toEqual({
      url: "https://analyzer.example.test",
      key: "ANALYZER_API_URL",
      fromEnv: true,
    })
  })

  test("missing env falls back to the documented Render default (not a silent empty host)", () => {
    const src = analyzerEnvSource({})
    expect(src.fromEnv).toBe(false)
    expect(src.url).toBe(DEFAULT_ANALYZER_API_URL)
    expect(analyzerUnreachableMessage(src.url)).toContain(DEFAULT_ANALYZER_API_URL)
    expect(analyzerMissingEnvMessage()).toContain("ANALYZER_API_URL")
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
