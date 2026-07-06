/**
 * Pins the Bright Data → propertyData adapter to the exact field contract
 * that /api/analyse scrape-only established, so the analyse form pre-fill
 * and PropertyListingCard keep working unchanged when the data source is
 * the Bright Data scraper instead of Apify.
 */
import { describe, expect, test } from "vitest"
import { listingToPropertyData } from "@/lib/scrapers/listing-adapter"
import type { RightmoveListing } from "@/lib/scrapers/rightmove-listing-scraper"

function makeListing(overrides: Partial<RightmoveListing> = {}): RightmoveListing {
  return {
    address: "14 Cardigan Road, Headingley, Leeds",
    postcode: "LS6 3AA",
    price: 385000,
    priceText: "£385,000",
    bedrooms: 3,
    bathrooms: 1,
    propertyType: "semi-detached",
    tenure: "freehold",
    leaseYearsRemaining: null,
    floorSizeSqft: 1001,
    floorSizeM2: 93,
    images: ["https://media.rightmove.co.uk/img1.jpeg"],
    floorplanUrl: "https://media.rightmove.co.uk/fp.png",
    floorplans: ["https://media.rightmove.co.uk/fp.png"],
    description: "A well-presented three bedroom semi.",
    keyFeatures: ["Three bedrooms", "Freehold"],
    epcRating: "C",
    epcUrl: null,
    councilTaxBand: "C",
    listingId: "999000111",
    listingUrl: "https://www.rightmove.co.uk/properties/999000111",
    agent: "Test Agents Leeds",
    agentPhone: "0113 000 0000",
    agentAddress: "1 Otley Road, Leeds",
    addedDate: "01/07/2026",
    reducedDate: null,
    originalPrice: null,
    isReduced: false,
    isSold: false,
    isUnderOffer: false,
    scrapedAt: "2026-07-06T10:00:00.000Z",
    source: "brightdata_rightmove",
    ...overrides,
  }
}

describe("listingToPropertyData", () => {
  test("maps a full listing to the /api/analyse propertyData contract", () => {
    const pd = listingToPropertyData(makeListing())
    expect(pd).toMatchObject({
      address: "14 Cardigan Road, Headingley, Leeds",
      postcode: "LS6 3AA",
      purchasePrice: 385000,
      propertyType: "house",
      propertyTypeDetail: "semi-detached",
      bedrooms: 3,
      bathrooms: 1,
      sqft: 1001,
      sqm: 93,
      sqftSource: "listing",
      tenureType: "freehold",
      agentName: "Test Agents Leeds",
      agentPhone: "0113 000 0000",
      listingUrl: "https://www.rightmove.co.uk/properties/999000111",
      councilTaxBand: "C",
      // PropertyListingCard + rental detection key off this exact value
      source: "rightmove",
    })
    expect(pd.images).toHaveLength(1)
    expect(pd.floorplans).toHaveLength(1)
  })

  test("flats map to broad type flat + flat-apartment detail", () => {
    const pd = listingToPropertyData(makeListing({ propertyType: "flat" }))
    expect(pd.propertyType).toBe("flat")
    expect(pd.propertyTypeDetail).toBe("flat-apartment")
  })

  test("leasehold carries leaseYears through", () => {
    const pd = listingToPropertyData(
      makeListing({ tenure: "leasehold", leaseYearsRemaining: 112 }),
    )
    expect(pd.tenureType).toBe("leasehold")
    expect(pd.leaseYears).toBe(112)
  })

  test("missing floor size falls back to the bedrooms heuristic, labelled estimated", () => {
    const pd = listingToPropertyData(
      makeListing({ floorSizeSqft: null, floorSizeM2: null, bedrooms: 3 }),
    )
    expect(pd.sqft).toBe(1001) // 3-bed semi bucket
    expect(pd.sqftSource).toBe("estimated")
  })

  test("no bedrooms and no size → sqft omitted, not zero", () => {
    const pd = listingToPropertyData(
      makeListing({ floorSizeSqft: null, floorSizeM2: null, bedrooms: null }),
    )
    expect(pd.sqft).toBeUndefined()
    expect(pd.sqftSource).toBeUndefined()
  })

  test("unknown tenure and empty media are omitted rather than empty strings", () => {
    const pd = listingToPropertyData(
      makeListing({ tenure: null, images: [], floorplans: [], agent: null }),
    )
    expect(pd.tenureType).toBeUndefined()
    expect(pd.images).toBeUndefined()
    expect(pd.floorplans).toBeUndefined()
    expect(pd.agentName).toBeUndefined()
  })
})
