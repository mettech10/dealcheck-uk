import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/apiAuth"
import { weeklyToMonthly, mapPropertyType } from "@/lib/propertydata"
import { cachedGetRents } from "@/lib/propertydata-cache"
import { scrapeRightmoveSearch } from "@/lib/scrapers/rightmove-search-scraper"

const FLASK_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

/**
 * Rental Listings — /api/comparables/rental-listings
 *
 * Chain (first non-empty result wins):
 *   1. PropertyData /rents raw_data — cheap + cached, but sparse in some
 *      districts (previously an empty raw_data still early-returned,
 *      showing "0 found").
 *   2. Bright Data Rightmove property-to-rent search — the in-house
 *      scraper; live listings with URLs and thumbnails.
 *   3. Flask /api/rental-comparables — legacy Apify actor path.
 */

// The Bright Data scrape drives a real browser session — well beyond the
// default function timeout.
export const maxDuration = 120
export const runtime = "nodejs"
export async function POST(req: Request) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { postcode, bedrooms, propertyType, propertyTypeDetail, strategy } = body

    if (!postcode) {
      return NextResponse.json(
        { success: false, message: "Postcode is required" },
        { status: 400 }
      )
    }

    console.log("[RENTAL-LISTINGS] Fetching - postcode:", postcode, "bedrooms:", bedrooms)

    // ── Primary: PropertyData /rents ────────────────────────────────────────
    const pdRents = await cachedGetRents(postcode, bedrooms || undefined)

    // Only take this branch when it actually has listings — an empty
    // raw_data used to early-return here and render "0 found" even though
    // the scraper fallbacks below could deliver.
    if (
      pdRents &&
      pdRents.status === "success" &&
      (pdRents.data?.long_let?.raw_data?.length ?? 0) > 0
    ) {
      const ll = pdRents.data!.long_let!
      const rawListings = ll.raw_data || []

      const listings = rawListings.map((r) => ({
        address: `${mapPropertyType(r.type)} · ${r.distance}km away`,
        monthlyRent: weeklyToMonthly(r.price),
        rentLabel: `£${weeklyToMonthly(r.price)}/mo`,
        bedrooms: r.bedrooms,
        propertyType: mapPropertyType(r.type),
        imageUrl: null,
        listingUrl: null, // PropertyData doesn't provide listing URLs
        agent: r.portal,
        priceFrequency: "monthly",
        source: "propertydata",
        distance: r.distance,
      }))

      const rents = listings.map((l) => l.monthlyRent).filter((r) => r > 0)
      const avgRent = rents.length > 0 ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0

      console.log("[RENTAL-LISTINGS] PropertyData success -", listings.length, "listings, avg £" + avgRent + "/mo")

      return NextResponse.json({
        success: true,
        source: "propertydata",
        data: {
          listings,
          count: listings.length,
          averageRent: avgRent,
          minRent: rents.length > 0 ? Math.min(...rents) : 0,
          maxRent: rents.length > 0 ? Math.max(...rents) : 0,
          searchArea: postcode.split(" ")[0],
          message: `${listings.length} rental comparables from PropertyData`,
        },
      })
    }

    console.log("[RENTAL-LISTINGS] PropertyData empty — trying Bright Data Rightmove search")

    // ── Secondary: Bright Data Rightmove to-rent search ────────────────────
    try {
      const rmListings = await scrapeRightmoveSearch({
        postcode,
        channel: "rent",
        ...(bedrooms ? { minBedrooms: bedrooms, maxBedrooms: bedrooms } : {}),
        sortType: "newest",
        maxResults: 12,
      })

      if (rmListings.length > 0) {
        const listings = rmListings.map((l) => ({
          address: l.address,
          monthlyRent: l.price,
          rentLabel: `£${l.price.toLocaleString("en-GB")}/mo`,
          bedrooms: l.bedrooms ?? undefined,
          propertyType: l.propertyType ?? "Property",
          imageUrl: l.thumbnailUrl,
          listingUrl: l.listingUrl,
          agent: null,
          priceFrequency: "monthly",
          source: "rightmove",
          distance: null,
        }))
        const rents = listings.map((l) => l.monthlyRent).filter((r) => r > 0)
        const avgRent =
          rents.length > 0
            ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length)
            : 0

        console.log(
          "[RENTAL-LISTINGS] Bright Data success -",
          listings.length,
          "listings, avg £" + avgRent + "/mo",
        )

        return NextResponse.json({
          success: true,
          source: "rightmove",
          data: {
            listings,
            count: listings.length,
            averageRent: avgRent,
            minRent: rents.length > 0 ? Math.min(...rents) : 0,
            maxRent: rents.length > 0 ? Math.max(...rents) : 0,
            searchArea: postcode.split(" ")[0],
            message: `${listings.length} live rental listings from Rightmove`,
          },
        })
      }
      console.log("[RENTAL-LISTINGS] Bright Data returned no listings — falling back to Flask")
    } catch (bdErr) {
      console.warn(
        "[RENTAL-LISTINGS] Bright Data error — falling back to Flask:",
        bdErr instanceof Error ? bdErr.message : String(bdErr),
      )
    }

    // ── Fallback: Flask backend ────────────────────────────────────────────
    try {
      const response = await fetch(`${FLASK_URL}/api/rental-comparables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.toUpperCase(),
          bedrooms: bedrooms || 3,
          ...(propertyType ? { propertyType } : {}),
          ...(propertyTypeDetail ? { propertyTypeDetail } : {}),
          ...(strategy ? { strategy } : {}),
        }),
      })

      const data = await response.json()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({
        success: false,
        message: "Failed to fetch rental comparables",
      })
    }
  } catch (error) {
    console.error("[RENTAL-LISTINGS] Error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch rental comparables" },
      { status: 500 }
    )
  }
}
