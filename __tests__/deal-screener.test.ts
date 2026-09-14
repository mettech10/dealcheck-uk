/**
 * Deal Screener — client-side rules, metrics, normalisation, handoff.
 *
 * These pin the MVP contract: photos off, user-entered rent, lowercase
 * strategyHint (`brrrr` not `BRR`), and Idempotency-Key shape.
 */
import { describe, expect, test } from "vitest"
import {
  SCHEMA_VERSION,
  applyDomFallbacks,
  buildHandoffRequest,
  collectFromPageModel,
  computeScreenMetrics,
  decodeIndexedPageModel,
  DEFAULT_RULES_PRESET,
  emptyCollectedPage,
  evaluateRules,
  idempotencyKey,
  isRightmoveListingDetailUrl,
  listingIdFromUrl,
  listingToFormPrefill,
  normaliseCollectedListing,
  normaliseStrategyHint,
  simpleGrossYield,
  simpleMonthlyCashflow,
  SIMPLE_CASHFLOW_ANNUAL_RATE,
  SIMPLE_CASHFLOW_LTV,
  strategyHintToInvestmentType,
  stripPhotos,
} from "@/lib/deal-screener"
import type { CollectedRightmovePage, NormalisedListingV1 } from "@/lib/deal-screener"

function collected(
  over: Partial<CollectedRightmovePage> = {},
): CollectedRightmovePage {
  return {
    ...emptyCollectedPage("https://www.rightmove.co.uk/properties/153629507"),
    fromPageModel: true,
    priceText: "£185,000",
    address: "42 Oakfield Avenue, Manchester M14 6LT",
    outcode: "M14",
    incode: "6LT",
    bedrooms: 3,
    bathrooms: 1,
    propertySubType: "Terraced",
    tenureType: "Freehold",
    description: "A well presented terraced house. EPC rating: C. Council Tax Band B.",
    keyFeatures: ["Three bedrooms", "Freehold", "EPC Rating: C"],
    ...over,
  }
}

describe("strategyHint", () => {
  test("lowercases and maps BRR/BRRRR to brrr", () => {
    expect(normaliseStrategyHint("BRR")).toBe("brrrr")
    expect(normaliseStrategyHint("BRRRR")).toBe("brrrr")
    expect(normaliseStrategyHint("brr")).toBe("brrrr")
    expect(normaliseStrategyHint("btl")).toBe("btl")
    expect(normaliseStrategyHint("HMO")).toBe("hmo")
    expect(normaliseStrategyHint("SA")).toBe("r2sa")
    expect(normaliseStrategyHint("nope")).toBeNull()
  })

  test("analyser form still uses brr for the BRRRR hint", () => {
    expect(strategyHintToInvestmentType("brrrr")).toBe("brr")
    expect(strategyHintToInvestmentType("btl")).toBe("btl")
  })
})

describe("simple metrics — not the analyser", () => {
  test("gross yield is (rent × 12) / price, and null without user rent", () => {
    expect(simpleGrossYield(200_000, 1000)).toBe(6)
    expect(simpleGrossYield(185_000, 950)).toBe(6.16)
    expect(simpleGrossYield(200_000, null)).toBeNull()
    expect(simpleGrossYield(0, 1000)).toBeNull()
  })

  test("simple cashflow is rent minus 75% LTV interest-only at 5%", () => {
    // 200k × 0.75 × 0.05 / 12 = 625; rent 950 → 325
    expect(SIMPLE_CASHFLOW_LTV).toBe(0.75)
    expect(SIMPLE_CASHFLOW_ANNUAL_RATE).toBe(0.05)
    expect(simpleMonthlyCashflow(200_000, 950)).toBe(325)
    expect(simpleMonthlyCashflow(200_000, null)).toBeNull()
  })
})

describe("evaluateRules", () => {
  const rules = DEFAULT_RULES_PRESET.rules

  test("pass when price, beds, yield, cashflow and strategy all clear", () => {
    const v = evaluateRules(
      { price: 185_000, bedrooms: 3, monthlyRent: 950, strategyHint: "btl" },
      rules,
    )
    expect(v.pass).toBe(true)
    expect(v.outcomes.every((o) => o.status === "pass")).toBe(true)
  })

  test("fail over max price", () => {
    const v = evaluateRules(
      { price: 300_000, bedrooms: 3, monthlyRent: 1500, strategyHint: "btl" },
      rules,
    )
    expect(v.outcomes.find((o) => o.id === "maxPrice")?.status).toBe("fail")
    expect(v.pass).toBe(false)
  })

  test("yield and cashflow stay pending until the user types rent", () => {
    const v = evaluateRules(
      { price: 185_000, bedrooms: 3, monthlyRent: null, strategyHint: "btl" },
      rules,
    )
    expect(v.outcomes.find((o) => o.id === "minGrossYield")?.status).toBe("pending")
    expect(v.outcomes.find((o) => o.id === "minSimpleCashflow")?.status).toBe(
      "pending",
    )
    expect(v.pass).toBe(false)
  })

  test("strategy allow-list rejects flip when only btl/brrrr/hmo are allowed", () => {
    const v = evaluateRules(
      { price: 185_000, bedrooms: 3, monthlyRent: 950, strategyHint: "FLIP" },
      rules,
    )
    expect(v.outcomes.find((o) => o.id === "strategyAllowList")?.status).toBe(
      "fail",
    )
    expect(v.pass).toBe(false)
  })
})

describe("normalise listing — photos stripped", () => {
  test("Rightmove listing-detail URLs only", () => {
    expect(
      isRightmoveListingDetailUrl(
        "https://www.rightmove.co.uk/properties/153629507#/",
      ),
    ).toBe(true)
    expect(
      isRightmoveListingDetailUrl(
        "https://www.rightmove.co.uk/property-for-sale/find.html",
      ),
    ).toBe(false)
    expect(listingIdFromUrl("https://www.rightmove.co.uk/properties/153629507")).toBe(
      "153629507",
    )
  })

  test("schemaVersion 1 listing has no photo fields and keeps user rent", () => {
    const listing = normaliseCollectedListing(collected(), 950, "2026-09-14T12:00:00.000Z")
    expect(listing.source).toBe("rightmove")
    expect(listing.sourceListingId).toBe("153629507")
    expect(listing.price).toBe(185000)
    expect(listing.postcode).toBe("M14 6LT")
    expect(listing.propertyType).toBe("terraced")
    expect(listing.tenure).toBe("freehold")
    expect(listing.epcRating).toBe("C")
    expect(listing.monthlyRent).toBe(950)
    expect(listing).not.toHaveProperty("images")
    expect(listing).not.toHaveProperty("floorplans")
    expect(listing).not.toHaveProperty("thumbnailUrl")
  })

  test("stripPhotos drops media keys if a caller smuggles them in", () => {
    const dirty = stripPhotos({
      address: "x",
      images: ["https://media.rightmove.co.uk/a.jpg"],
      floorplans: ["https://media.rightmove.co.uk/fp.png"],
      thumbnailUrl: "https://x",
    })
    expect(dirty).toEqual({ address: "x" })
  })
})

describe("PAGE_MODEL capture", () => {
  test("reads propertyData and never copies images", () => {
    const pageModel = {
      propertyData: {
        prices: { primaryPrice: "£220,000" },
        address: {
          displayAddress: "1 Test Road, Leeds LS6 3AA",
          outcode: "LS6",
          incode: "3AA",
        },
        bedrooms: 2,
        bathrooms: 1,
        propertySubType: "Flat",
        tenure: { tenureType: "Leasehold", yearsRemainingOnLease: 87 },
        text: { description: "A first floor apartment." },
        keyFeatures: ["Two bedrooms"],
        images: [{ url: "https://media.rightmove.co.uk/secret.jpg" }],
        floorplans: [{ url: "https://media.rightmove.co.uk/fp.png" }],
        customer: { branchDisplayName: "Test Agents" },
        contactInfo: { telephoneNumbers: { localNumber: "0113 000 0000" } },
        livingCosts: { councilTaxBand: "B" },
        sizings: [{ unit: "sqft", minimumSize: 624 }],
      },
    }
    const raw = collectFromPageModel(
      pageModel,
      null,
      "https://www.rightmove.co.uk/properties/111",
    )
    expect(raw?.fromPageModel).toBe(true)
    expect(raw?.priceText).toBe("£220,000")
    expect(raw?.bedrooms).toBe(2)
    expect(raw?.floorSizeSqft).toBe(624)
    expect(raw).not.toHaveProperty("images")
    const listing = normaliseCollectedListing(raw!)
    expect(listing.propertyType).toBe("flat")
    expect(listing.leaseYearsRemaining).toBe(87)
    expect(listing).not.toHaveProperty("images")
  })

  test("decodes indexed __PAGE_MODEL payloads", () => {
    // Index encoding: numbers inside objects are pointers into the array.
    // [ {propertyData: 1}, {bedrooms: 2}, 3 ] → { propertyData: { bedrooms: 3 } }
    const encoded = JSON.stringify([{ propertyData: 1 }, { bedrooms: 2 }, 3])
    const decoded = decodeIndexedPageModel(encoded) as {
      propertyData: { bedrooms: number }
    }
    expect(decoded.propertyData.bedrooms).toBe(3)
  })

  test("DOM fallbacks fill blanks when PAGE_MODEL is missing", () => {
    const merged = applyDomFallbacks(emptyCollectedPage("https://www.rightmove.co.uk/properties/9"), {
      priceText: "£99,995",
      address: "9 Fallback Street",
      keyFeatures: ["One bedroom"],
    })
    expect(merged.priceText).toBe("£99,995")
    expect(merged.address).toBe("9 Fallback Street")
  })
})

describe("handoff POST body", () => {
  test("source screener, schemaVersion 1, brrr hint, idempotency key", () => {
    const listing: NormalisedListingV1 = normaliseCollectedListing(
      collected(),
      900,
    )
    const body = buildHandoffRequest(listing, "BRR")
    expect(body.source).toBe("screener")
    expect(body.schemaVersion).toBe(SCHEMA_VERSION)
    expect(body.strategyHint).toBe("brrrr")
    expect(body.listing.monthlyRent).toBe(900)
    expect(idempotencyKey(body.listing.source, body.listing.sourceListingId)).toBe(
      "screener:rightmove:153629507",
    )
    expect(listingToFormPrefill(body.listing, body.strategyHint).investmentType).toBe(
      "brr",
    )
    expect(computeScreenMetrics({ price: listing.price, monthlyRent: 900 }).grossYield).toBeGreaterThan(0)
  })
})
