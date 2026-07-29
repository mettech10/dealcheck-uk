/**
 * Zoopla scraper — unit tests for the pure parts (URL detection + the
 * normaliser that turns the in-page raw extract into a ZooplaListing).
 *
 * The browser half needs Bright Data credentials and a live page, so it
 * can't run here; these pin the parsing/normalisation logic, which is where
 * portal-format bugs actually live.
 */
import { describe, expect, test } from "vitest"
import {
  isZooplaListingUrl,
  normaliseZooplaRaw,
  type RawZoopla,
} from "@/lib/scrapers/zoopla-listing-scraper"

function raw(overrides: Partial<RawZoopla> = {}): RawZoopla {
  return {
    strategy: "inline-json",
    priceText: "",
    address: "",
    bedrooms: null,
    bathrooms: null,
    receptions: null,
    propertyType: "",
    tenure: "",
    floorArea: "",
    images: [],
    floorplans: [],
    description: "",
    keyFeatures: [],
    epcRating: "",
    councilTaxBand: "",
    agentName: "",
    agentPhone: "",
    statusText: "",
    pageTextSample: "",
    ...overrides,
  }
}

const URL = "https://www.zoopla.co.uk/for-sale/details/70123456/"

describe("isZooplaListingUrl", () => {
  test("accepts for-sale and to-rent detail pages", () => {
    expect(isZooplaListingUrl(URL)).toBe(true)
    expect(isZooplaListingUrl("https://www.zoopla.co.uk/to-rent/details/999/")).toBe(true)
  })
  test("rejects search pages, other portals and bare domain", () => {
    expect(isZooplaListingUrl("https://www.zoopla.co.uk/for-sale/property/sale/")).toBe(false)
    expect(isZooplaListingUrl("https://www.zoopla.co.uk")).toBe(false)
    expect(isZooplaListingUrl("https://www.rightmove.co.uk/properties/12345")).toBe(false)
  })
})

describe("normaliseZooplaRaw", () => {
  test("parses a well-formed inline-JSON extract", () => {
    const l = normaliseZooplaRaw(
      raw({
        priceText: "£250,000",
        address: "Newbury Avenue, Sale, M33 4QW",
        bedrooms: 3,
        bathrooms: 1,
        propertyType: "End terrace house",
        tenure: "Freehold",
        floorArea: "957 sq ft",
        images: ["https://lid.zoocdn.com/a.jpg", "https://lid.zoocdn.com/a.jpg"],
        description: "A well proportioned three bedroom end terraced property. Council Tax Band - A. EPC Rating: C",
      }),
      URL,
    )
    expect(l.price).toBe(250000)
    expect(l.postcode).toBe("M33 4QW")
    expect(l.bedrooms).toBe(3)
    expect(l.bathrooms).toBe(1)
    expect(l.propertyType).toBe("end-terrace")
    expect(l.tenure).toBe("freehold")
    expect(l.floorSizeSqft).toBe(957)
    expect(l.floorSizeM2).toBe(89) // derived
    expect(l.councilTaxBand).toBe("A")
    expect(l.epcRating).toBe("C")
    expect(l.images).toHaveLength(1) // de-duplicated
    expect(l.listingId).toBe("70123456")
    expect(l.source).toBe("brightdata_zoopla")
  })

  test("falls back to page text for beds/baths/price when the model is sparse", () => {
    const l = normaliseZooplaRaw(
      raw({
        address: "Oak Road, Leeds LS6 1AN",
        pageTextSample: "Guide price £185,000 · 2 bed 1 bath flat, leasehold, 92 years remaining",
      }),
      URL,
    )
    expect(l.price).toBe(185000)
    expect(l.bedrooms).toBe(2)
    expect(l.bathrooms).toBe(1)
    expect(l.tenure).toBe("leasehold")
    expect(l.leaseYearsRemaining).toBe(92)
    expect(l.postcode).toBe("LS6 1AN")
  })

  test("handles 'Offers over' and sq m sizes", () => {
    const l = normaliseZooplaRaw(
      raw({ priceText: "Offers over £399,950", floorArea: "110 sq m", propertyType: "Semi-detached house" }),
      URL,
    )
    expect(l.price).toBe(399950)
    expect(l.floorSizeM2).toBe(110)
    expect(l.floorSizeSqft).toBe(1184) // derived
    expect(l.propertyType).toBe("semi-detached")
  })

  test("detects sold / under offer status", () => {
    expect(normaliseZooplaRaw(raw({ statusText: "Sold STC" }), URL).isSold).toBe(true)
    expect(normaliseZooplaRaw(raw({ statusText: "Under offer" }), URL).isUnderOffer).toBe(true)
    expect(normaliseZooplaRaw(raw({ statusText: "" }), URL).isSold).toBe(false)
  })

  test("empty extract degrades to zeros/nulls rather than throwing", () => {
    const l = normaliseZooplaRaw(raw(), URL)
    expect(l.price).toBe(0)
    expect(l.postcode).toBe("")
    expect(l.bedrooms).toBeNull()
    expect(l.propertyType).toBeNull()
    expect(l.councilTaxBand).toBeNull()
  })
})
