/**
 * Deal Screener — client-side rules, metrics, normalisation, handoff.
 *
 * Wire contract matches Flask POST /v1/deals (canonical SoT).
 * Next GET hydrates shared `deals` (+ properties), not screener_deals.
 */
import { describe, expect, test } from "vitest"
import {
  SCHEMA_VERSION,
  applyDomFallbacks,
  buildExtensionConnectHash,
  connectRedirectError,
  buildHandoffRequest,
  collectFromPageModel,
  computeScreenMetrics,
  decodeIndexedPageModel,
  DEFAULT_RULES_PRESET,
  emptyCollectedPage,
  evaluateRules,
  flaskDealsUrl,
  idempotencyKey,
  isNextDealsCreatePath,
  isRightmoveListingDetailUrl,
  isSafeExtensionRedirect,
  listingIdFromUrl,
  hydrateFromDealRow,
  listingToFormPrefill,
  mergePropertySpine,
  normaliseCollectedListing,
  normaliseStrategyHint,
  parseHandoffResponse,
  resolveDeepLinkUrl,
  resolveFlaskBackendOrigin,
  resolveIdempotencyKey,
  screenerConnectLoginPath,
  screenerConnectPath,
  simpleGrossYield,
  simpleMonthlyCashflow,
  SIMPLE_CASHFLOW_ANNUAL_RATE,
  SIMPLE_CASHFLOW_LTV,
  strategyHintToInvestmentType,
  stripPhotos,
  toFlaskListing,
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
  test("lowercases and maps BRR/BRRRR to brrr, r2sa to sa", () => {
    expect(normaliseStrategyHint("BRR")).toBe("brrrr")
    expect(normaliseStrategyHint("BRRRR")).toBe("brrrr")
    expect(normaliseStrategyHint("brr")).toBe("brrrr")
    expect(normaliseStrategyHint("btl")).toBe("btl")
    expect(normaliseStrategyHint("HMO")).toBe("hmo")
    expect(normaliseStrategyHint("SA")).toBe("sa")
    expect(normaliseStrategyHint("r2sa")).toBe("sa")
    expect(normaliseStrategyHint("development")).toBe("development")
    expect(normaliseStrategyHint("DEV")).toBe("development")
    expect(normaliseStrategyHint("")).toBe("btl")
    expect(normaliseStrategyHint("OTHER")).toBe("btl")
    expect(normaliseStrategyHint("nope")).toBeNull()
  })

  test("analyser form maps brrr→brr and sa→r2sa", () => {
    expect(strategyHintToInvestmentType("brrrr")).toBe("brr")
    expect(strategyHintToInvestmentType("sa")).toBe("r2sa")
    expect(strategyHintToInvestmentType("btl")).toBe("btl")
    expect(strategyHintToInvestmentType("development")).toBe("development")
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

  test("schemaVersion 1 listing uses Flask field names and keeps user rent", () => {
    const listing = normaliseCollectedListing(collected(), 950, "2026-09-14T12:00:00.000Z")
    expect(listing.source).toBe("rightmove")
    expect(listing.sourceListingId).toBe("153629507")
    expect(listing.listingUrl).toContain("/properties/153629507")
    expect(listing.priceGbp).toBe(185000)
    expect(listing.rentPcmGbp).toBe(950)
    expect(listing.postcode).toBe("M14 6LT")
    expect(listing.propertyType).toBe("terraced")
    expect(listing.tenure).toBe("freehold")
    expect(listing.epcRating).toBe("C")
    expect(listing).not.toHaveProperty("images")
    expect(listing).not.toHaveProperty("price")
    expect(listing).not.toHaveProperty("monthlyRent")
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
    expect(listing.priceGbp).toBe(220000)
    expect(listing).not.toHaveProperty("images")
  })

  test("decodes indexed __PAGE_MODEL payloads", () => {
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

describe("handoff POST body — Flask canonical fields", () => {
  test("source screener, schemaVersion 1, brrr hint, Flask listing fields", () => {
    const listing: NormalisedListingV1 = normaliseCollectedListing(
      collected(),
      900,
    )
    const body = buildHandoffRequest(listing, "BRR")
    expect(body.source).toBe("screener")
    expect(body.schemaVersion).toBe(SCHEMA_VERSION)
    expect(body.strategyHint).toBe("brrrr")
    expect(body.listing.priceGbp).toBe(185000)
    expect(body.listing.rentPcmGbp).toBe(900)
    expect(body.listing.listingUrl).toContain("/properties/153629507")
    expect(body.listing).not.toHaveProperty("price")
    expect(body.listing).not.toHaveProperty("monthlyRent")
    expect(idempotencyKey(body.listing.source, body.listing.sourceListingId)).toBe(
      "screener:rightmove:153629507",
    )
    expect(listingToFormPrefill(body.listing, body.strategyHint!).investmentType).toBe(
      "brr",
    )
    expect(computeScreenMetrics({ price: listing.priceGbp, monthlyRent: 900 }).grossYield).toBeGreaterThan(0)
  })

  test("omits strategyHint when btl so Flask defaults", () => {
    const listing = normaliseCollectedListing(collected(), 950)
    const body = buildHandoffRequest(listing, "btl")
    expect(body.strategyHint).toBeUndefined()
    const omitted = buildHandoffRequest(listing, "")
    expect(omitted.strategyHint).toBeUndefined()
  })

  test("maps sourceUrl/beds/monthlyRent aliases onto Flask names", () => {
    const canonical = toFlaskListing({
      source: "rightmove",
      sourceListingId: "99",
      sourceUrl: "https://www.rightmove.co.uk/properties/99",
      address: "1 Alias Street",
      postcode: "M1 1AA",
      price: 150000,
      beds: 2,
      monthlyRent: 800,
    })
    expect(canonical.listingUrl).toBe("https://www.rightmove.co.uk/properties/99")
    expect(canonical.priceGbp).toBe(150000)
    expect(canonical.bedrooms).toBe(2)
    expect(canonical.rentPcmGbp).toBe(800)
  })

  test("synthesises Idempotency-Key when the header is missing", () => {
    expect(resolveIdempotencyKey("", "rightmove", "123")).toBe(
      "screener:rightmove:123",
    )
    expect(resolveIdempotencyKey("screener:rightmove:123", "rightmove", "999")).toBe(
      "screener:rightmove:123",
    )
  })

  test("opens Flask deepLinkPath on the app origin as returned", () => {
    const parsed = parseHandoffResponse({
      dealId: "deal-1",
      propertyId: "prop-1",
      status: "created",
      deepLinkPath:
        "/analyse?dealId=deal-1&strategy=btl&propertyId=prop-1&url=https%3A%2F%2Fwww.rightmove.co.uk%2Fproperties%2F1",
    })
    expect(parsed.status).toBe("created")
    expect(parsed.propertyId).toBe("prop-1")
    expect(
      resolveDeepLinkUrl("https://www.metalyzi.co.uk", parsed.deepLinkPath),
    ).toContain("https://www.metalyzi.co.uk/analyse?dealId=deal-1")
    expect(parsed.deepLinkPath).toContain("strategy=btl")
    expect(parsed.deepLinkPath).toContain("propertyId=prop-1")
  })
})

describe("GET hydrate from shared deals (+ properties)", () => {
  test("fills rentPcmGbp from deals.rent_pcm_gbp when listing JSON omits it", () => {
    const hydrated = hydrateFromDealRow({
      id: "11111111-1111-1111-1111-111111111111",
      property_id: "22222222-2222-2222-2222-222222222222",
      strategy: "sa",
      rent_pcm_gbp: "950.00",
      listing: {
        source: "rightmove",
        sourceListingId: "153629507",
        listingUrl: "https://www.rightmove.co.uk/properties/153629507",
        address: "42 Oakfield Avenue, Manchester",
        postcode: "M14 6LT",
        priceGbp: 185000,
        bedrooms: 3,
        images: ["https://media.rightmove.co.uk/secret.jpg"],
      },
      status: "created",
    })
    expect(hydrated.listing.rentPcmGbp).toBe(950)
    expect(hydrated.listing.sourceUrl).toContain("/properties/153629507")
    expect(hydrated.listing.beds).toBe(3)
    expect(hydrated.listing).not.toHaveProperty("images")
    expect(hydrated.strategyHint).toBe("sa")
    expect(hydrated.formPrefill.monthlyRent).toBe(950)
    expect(hydrated.formPrefill.investmentType).toBe("r2sa")
    expect(hydrated.formPrefill.purchasePrice).toBe(185000)
    expect(hydrated.propertyId).toBe("22222222-2222-2222-2222-222222222222")
  })

  test("merges Discovery properties spine into a sparse listing", () => {
    const merged = mergePropertySpine(
      { listingUrl: "https://www.rightmove.co.uk/properties/9" },
      {
        canonical_address: "9 Spine Street, Leeds",
        postcode: "LS6 3AA",
        bedrooms: 2,
        property_type: "flat",
        tenure: "leasehold",
      },
    )
    const hydrated = hydrateFromDealRow(
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        strategy: "btl",
        rent_pcm_gbp: 800,
        listing: merged,
      },
      {
        canonical_address: "9 Spine Street, Leeds",
        postcode: "LS6 3AA",
        bedrooms: 2,
        property_type: "flat",
        tenure: "leasehold",
      },
    )
    expect(hydrated.listing.address).toBe("9 Spine Street, Leeds")
    expect(hydrated.listing.postcode).toBe("LS6 3AA")
    expect(hydrated.listing.bedrooms).toBe(2)
    expect(hydrated.listing.propertyType).toBe("flat")
    expect(hydrated.listing.tenure).toBe("leasehold")
    expect(hydrated.formPrefill.monthlyRent).toBe(800)
    expect(hydrated.strategyHint).toBe("btl")
  })

  test("maps listing aliases sourceUrl/beds onto Flask names", () => {
    const hydrated = hydrateFromDealRow({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      listing: {
        sourceUrl: "https://www.rightmove.co.uk/properties/99",
        beds: 2,
        priceGbp: 150000,
        rentPcmGbp: 800,
        address: "1 Alias Street",
        postcode: "M1 1AA",
      },
    })
    expect(hydrated.listing.listingUrl).toContain("/properties/99")
    expect(hydrated.listing.sourceUrl).toBe(hydrated.listing.listingUrl)
    expect(hydrated.listing.bedrooms).toBe(2)
    expect(hydrated.listing.beds).toBe(2)
  })
})

describe("Open in Metalyzi targets Flask, never Next create / screener_deals", () => {
  test("env precedence: NEXT_PUBLIC_ANALYZER_API_URL then METUSA_API_URL then BACKEND_API_URL", () => {
    expect(
      resolveFlaskBackendOrigin({
        NEXT_PUBLIC_ANALYZER_API_URL: "https://analyzer.example",
        METUSA_API_URL: "https://metusa.example",
        BACKEND_API_URL: "https://backend.example",
      }),
    ).toBe("https://analyzer.example")
    expect(
      resolveFlaskBackendOrigin({
        METUSA_API_URL: "https://metusa.example/",
        BACKEND_API_URL: "https://backend.example",
      }),
    ).toBe("https://metusa.example")
    expect(
      resolveFlaskBackendOrigin({
        BACKEND_API_URL: "https://metusa-deal-analyzer.onrender.com",
      }),
    ).toBe("https://metusa-deal-analyzer.onrender.com")
    expect(resolveFlaskBackendOrigin({})).toBe(
      "https://metusa-deal-analyzer.onrender.com",
    )
  })

  test("POST URL is Flask /v1/deals, not Next /api/v1/deals", () => {
    const url = flaskDealsUrl(undefined, {
      NEXT_PUBLIC_ANALYZER_API_URL: "https://metusa-deal-analyzer.onrender.com",
    })
    expect(url).toBe("https://metusa-deal-analyzer.onrender.com/v1/deals")
    expect(isNextDealsCreatePath(url)).toBe(false)
    expect(isNextDealsCreatePath("https://www.metalyzi.co.uk/api/v1/deals")).toBe(
      true,
    )
    expect(isNextDealsCreatePath("https://www.metalyzi.co.uk/v1/deals")).toBe(
      true,
    )
    expect(isNextDealsCreatePath("http://localhost:3000/api/v1/deals")).toBe(
      true,
    )
  })
})

describe("/screener/connect redirect allowlist + login returnTo", () => {
  const extId = "abcdefghijklmnopabcdefghijklmnop"
  const good = `https://${extId}.chromiumapp.org/callback`

  test("accepts https chromiumapp.org with a 32-char a-p extension id", () => {
    expect(isSafeExtensionRedirect(good)).toBe(true)
    expect(isSafeExtensionRedirect(`${good}?state=1`)).toBe(true)
  })

  test("rejects non-extension redirect_uri values (open-redirect)", () => {
    expect(isSafeExtensionRedirect("https://evil.example/callback")).toBe(false)
    expect(isSafeExtensionRedirect(`http://${extId}.chromiumapp.org/`)).toBe(false)
    expect(isSafeExtensionRedirect("https://notchromiumapp.org/")).toBe(false)
    expect(isSafeExtensionRedirect("https://abc.chromiumapp.org/")).toBe(false)
    expect(isSafeExtensionRedirect("/screener/connect")).toBe(false)
    expect(isSafeExtensionRedirect("")).toBe(false)
  })

  test("invalid redirect_uri is a Connect error only — never an external hop or sign-out", () => {
    const evil = "https://evil.example.com/callback"
    expect(isSafeExtensionRedirect(evil)).toBe(false)
    expect(connectRedirectError(evil)).toMatch(/invalid extension redirect URL/)
    expect(connectRedirectError("")).toMatch(/Open this page from the Deal Screener/)
    expect(connectRedirectError(good)).toBeNull()
    // Login returnTo stays on-origin even when the untrusted URI is present
    expect(screenerConnectLoginPath(evil).startsWith("/login?returnTo=")).toBe(true)
    expect(screenerConnectLoginPath(evil)).not.toContain("https://evil.example.com")
  })

  test("login bounce preserves redirect_uri inside returnTo (same encoding as /account-style gate)", () => {
    expect(screenerConnectPath(null)).toBe("/screener/connect")
    expect(screenerConnectPath(good)).toBe(
      `/screener/connect?redirect_uri=${encodeURIComponent(good)}`,
    )
    expect(screenerConnectLoginPath(good)).toBe(
      `/login?returnTo=${encodeURIComponent(
        `/screener/connect?redirect_uri=${encodeURIComponent(good)}`,
      )}`,
    )
  })

  test("extension hash carries tokens in the fragment contract, never a query string", () => {
    const hash = buildExtensionConnectHash({
      access_token: "tok_abc",
      expires_in: 3600,
      expires_at: 1_700_000_000,
      refresh_token: "ref_xyz",
    })
    const params = new URLSearchParams(hash)
    expect(params.get("access_token")).toBe("tok_abc")
    expect(params.get("refresh_token")).toBe("ref_xyz")
    expect(params.get("token_type")).toBe("bearer")
    expect(params.get("expires_in")).toBe("3600")
    expect(`${good}#${hash}`).toContain("#")
    expect(`${good}#${hash}`).not.toMatch(/\?access_token=/)
  })
})
