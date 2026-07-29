/**
 * Zoopla listing scraper (Bright Data Scraping Browser).
 *
 * Twin of rightmove-listing-scraper.ts — same contract: one exported async
 * function returning a typed listing, FAILING GRACEFULLY (null) on any error
 * so callers fall back instead of throwing.
 *
 * Why a real browser is required: Zoopla is behind a Cloudflare *managed
 * challenge* (the "Enable JavaScript and cookies to continue" interstitial).
 * A plain fetch gets a 403 challenge page, which is why plain-HTTP scrape
 * paths can't read Zoopla at all. The Bright Data Scraping Browser executes
 * the challenge like a real Chrome, so the listing HTML is reachable.
 *
 * Extraction strategy — deliberately shape-agnostic, because Zoopla's
 * Next.js data model is not a stable public contract and its internal key
 * names change between releases. Rather than depend on one brittle path we
 * try, in order:
 *   1. Any inline JSON (__NEXT_DATA__ / Apollo / other state blobs) —
 *      deep-searched for the node that actually looks like a listing.
 *   2. JSON-LD (schema.org) blocks.
 *   3. DOM + meta tags + visible page text.
 * Whichever yields a price + address wins, and individual fields fall
 * through independently, so a partial model still produces a usable listing.
 */
import {
  connectBrightData,
  newBrightDataContext,
  closeBrightData,
} from "./brightdata-browser"
import { extractCouncilTaxBand } from "@/lib/councilTax"

export interface ZooplaListing {
  address: string
  postcode: string
  price: number
  priceText: string

  bedrooms: number | null
  bathrooms: number | null
  receptions: number | null
  propertyType: string | null
  tenure: string | null
  leaseYearsRemaining: number | null

  floorSizeSqft: number | null
  floorSizeM2: number | null

  images: string[]
  floorplans: string[]

  description: string | null
  keyFeatures: string[]

  epcRating: string | null
  councilTaxBand: string | null

  listingId: string | null
  listingUrl: string
  agent: string | null
  agentPhone: string | null

  isSold: boolean
  isUnderOffer: boolean

  scrapedAt: string
  source: "brightdata_zoopla"
}

/** Raw payload assembled in-page; parsed/normalised back in Node. */
export interface RawZoopla {
  strategy: string
  priceText: string
  address: string
  bedrooms: number | null
  bathrooms: number | null
  receptions: number | null
  propertyType: string
  tenure: string
  floorArea: string
  images: string[]
  floorplans: string[]
  description: string
  keyFeatures: string[]
  epcRating: string
  councilTaxBand: string
  agentName: string
  agentPhone: string
  statusText: string
  pageTextSample: string
}

/** Zoopla listing URLs: /for-sale/details/<id> or /to-rent/details/<id>. */
export function isZooplaListingUrl(url: string): boolean {
  return /zoopla\.co\.uk/i.test(url) && /\/details\/\d+/.test(url)
}

export async function scrapeZooplaListing(
  url: string,
): Promise<ZooplaListing | null> {
  console.log("[Zoopla-Listing] scrape", { url })

  const browser = await connectBrightData()
  if (!browser) {
    console.warn("[Zoopla-Listing] Bright Data not configured — skipping")
    return null
  }

  try {
    const context = await newBrightDataContext(browser)
    const page = await context.newPage()

    // networkidle would hang on Zoopla's long-poll/analytics; domcontentloaded
    // plus a short settle is enough for the inline data model + SSR markup.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    // Give the Cloudflare challenge (if served) time to clear and the app to
    // hydrate. Bright Data solves the challenge itself; we just wait it out.
    await page.waitForTimeout(2500)
    await page
      .waitForSelector('script#__NEXT_DATA__, [data-testid="listing-summary-details"], h1', {
        timeout: 12000,
      })
      .catch(() => null)

    const title = await page.title()
    console.log("[Zoopla-Listing] page title:", title)

    const raw = await page.evaluate((): RawZoopla => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const out: RawZoopla = {
        strategy: "none",
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
      }

      const txt = (v: any): string =>
        v === null || v === undefined ? "" : String(v).trim()
      const num = (v: any): number | null => {
        const n = typeof v === "number" ? v : parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10)
        return Number.isFinite(n) && n >= 0 ? n : null
      }

      // ── 1. Inline JSON blobs, deep-searched ──────────────────────────
      // Collect every parseable inline JSON object, then hunt for the node
      // that looks like a listing (has a price AND an address-ish field).
      const blobs: any[] = []
      for (const s of Array.from(document.querySelectorAll("script"))) {
        const t = (s.textContent || "").trim()
        if (!t || t.length < 40) continue
        const type = (s.getAttribute("type") || "").toLowerCase()
        const looksJson =
          type.includes("json") || t.startsWith("{") || t.startsWith("[")
        if (!looksJson) continue
        try {
          blobs.push(JSON.parse(t))
        } catch {
          /* not JSON — ignore */
        }
      }

      const listingCandidates: any[] = []
      const seen = new Set<any>()
      const walk = (node: any, depth: number) => {
        if (!node || typeof node !== "object" || depth > 12) return
        if (seen.has(node)) return
        seen.add(node)
        if (Array.isArray(node)) {
          for (const el of node) walk(el, depth + 1)
          return
        }
        const keys = Object.keys(node)
        const hasPrice = keys.some((k) => /^(price|pricing|displayPrice|priceLabel)$/i.test(k))
        const hasAddr = keys.some((k) =>
          /^(address|displayAddress|title|streetAddress|propertyAddress)$/i.test(k),
        )
        const hasBeds = keys.some((k) => /(bedroom|numBedrooms|beds)/i.test(k))
        if ((hasPrice && hasAddr) || (hasPrice && hasBeds) || (hasAddr && hasBeds)) {
          listingCandidates.push(node)
        }
        for (const k of keys) walk(node[k], depth + 1)
      }
      for (const b of blobs) walk(b, 0)

      // Prefer the richest candidate (most of the fields we care about).
      const score = (o: any): number => {
        let s = 0
        for (const k of Object.keys(o)) {
          if (/price|address|bedroom|bathroom|tenure|image|description|feature|agent|floor/i.test(k)) s++
        }
        return s
      }
      listingCandidates.sort((a, b) => score(b) - score(a))
      const L = listingCandidates[0]

      const pick = (obj: any, patterns: RegExp[]): any => {
        if (!obj) return undefined
        for (const p of patterns) {
          for (const k of Object.keys(obj)) {
            if (p.test(k)) {
              const v = obj[k]
              if (v !== null && v !== undefined && v !== "") return v
            }
          }
        }
        return undefined
      }

      if (L) {
        out.strategy = "inline-json"
        const priceRaw = pick(L, [/^price$/i, /^pricing$/i, /displayPrice/i, /priceLabel/i])
        out.priceText =
          typeof priceRaw === "object"
            ? txt(pick(priceRaw, [/label/i, /display/i, /value/i, /amount/i]))
            : txt(priceRaw)

        const addrRaw = pick(L, [/^displayAddress$/i, /^address$/i, /streetAddress/i, /^title$/i])
        out.address =
          typeof addrRaw === "object"
            ? txt(pick(addrRaw, [/display/i, /full/i, /line/i, /street/i]))
            : txt(addrRaw)

        out.bedrooms = num(pick(L, [/numBedrooms/i, /^bedrooms?$/i, /^beds$/i]))
        out.bathrooms = num(pick(L, [/numBathrooms/i, /^bathrooms?$/i, /^baths$/i]))
        out.receptions = num(pick(L, [/numLivingRooms/i, /reception/i]))
        out.propertyType = txt(pick(L, [/propertyType/i, /^type$/i, /category/i]))
        out.tenure = txt(pick(L, [/tenure/i]))
        out.floorArea = txt(
          (() => {
            const fa = pick(L, [/floorArea/i, /^size$/i, /internalArea/i])
            return typeof fa === "object"
              ? `${txt(pick(fa, [/value/i, /amount/i]))} ${txt(pick(fa, [/unit/i, /label/i]))}`
              : fa
          })(),
        )
        const desc = pick(L, [/detailedDescription/i, /^description$/i, /propertyDescription/i])
        out.description = typeof desc === "object" ? txt(pick(desc, [/text/i, /html/i, /value/i])) : txt(desc)
        const feats = pick(L, [/features/i, /bulletPoints/i, /keyFeatures/i])
        if (Array.isArray(feats)) {
          out.keyFeatures = feats
            .map((f: any) => (typeof f === "string" ? f : txt(pick(f, [/text/i, /label/i, /value/i]))))
            .filter(Boolean)
            .slice(0, 20)
        }
        const agent = pick(L, [/agent/i, /branch/i])
        if (agent && typeof agent === "object") {
          out.agentName = txt(pick(agent, [/^name$/i, /branchName/i, /companyName/i]))
          out.agentPhone = txt(pick(agent, [/phone/i, /telephone/i]))
        }
        const imgs = pick(L, [/^images?$/i, /propertyImage/i, /gallery/i, /photos/i])
        if (Array.isArray(imgs)) {
          out.images = imgs
            .map((i: any) =>
              typeof i === "string" ? i : txt(pick(i, [/original/i, /large/i, /src/i, /url/i, /filename/i, /uri/i])),
            )
            .filter((u: string) => /^https?:\/\//.test(u))
            .slice(0, 30)
        }
        out.epcRating = txt(pick(L, [/epcRating/i, /energyRating/i, /currentEnergy/i]))
        out.councilTaxBand = txt(pick(L, [/councilTax/i]))
      }

      // ── 2. JSON-LD ───────────────────────────────────────────────────
      if (!out.address || !out.priceText) {
        for (const s of Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )) {
          try {
            const j = JSON.parse(s.textContent || "{}")
            const nodes = Array.isArray(j) ? j : [j, ...(j["@graph"] || [])]
            for (const n of nodes) {
              if (!n || typeof n !== "object") continue
              if (!out.address) {
                const a = n.address
                out.address =
                  typeof a === "string"
                    ? a
                    : a
                      ? [a.streetAddress, a.addressLocality, a.postalCode].filter(Boolean).join(", ")
                      : txt(n.name)
              }
              if (!out.priceText) {
                const offer = n.offers || n.offer
                out.priceText = txt(offer?.price ?? offer?.lowPrice ?? n.price)
              }
              if (out.bedrooms == null) out.bedrooms = num(n.numberOfRooms ?? n.numberOfBedrooms)
              if (!out.description) out.description = txt(n.description)
              if (!out.images.length && n.image) {
                out.images = (Array.isArray(n.image) ? n.image : [n.image])
                  .map((x: any) => (typeof x === "string" ? x : txt(x?.url)))
                  .filter(Boolean)
              }
              if (out.address && out.priceText) out.strategy = out.strategy === "none" ? "json-ld" : out.strategy
            }
          } catch {
            /* ignore */
          }
        }
      }

      // ── 3. DOM / meta / text fallbacks ───────────────────────────────
      const meta = (p: string): string =>
        txt(document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute("content"))

      if (!out.address) {
        out.address = txt(document.querySelector("h1")?.textContent) || meta("og:title")
      }
      if (!out.priceText) {
        const pEl = document.querySelector(
          '[data-testid="price"], [class*="Price"], [class*="price"]',
        )
        out.priceText = txt(pEl?.textContent) || meta("og:title")
      }
      if (!out.description) {
        out.description =
          txt(
            document.querySelector(
              '[data-testid="truncated_text_container"], [class*="description"]',
            )?.textContent,
          ) || meta("og:description")
      }
      if (!out.images.length) {
        const og = meta("og:image")
        const domImgs = Array.from(document.querySelectorAll("img"))
          .map((i) => i.getAttribute("src") || "")
          .filter((u) => /^https?:\/\//.test(u) && /(lid\.zoocdn|zoocdn|zoopla)/i.test(u))
        out.images = [og, ...domImgs].filter(Boolean).slice(0, 30)
      }
      if (!out.keyFeatures.length) {
        out.keyFeatures = Array.from(
          document.querySelectorAll('[data-testid*="feature"] li, ul[class*="feature"] li'),
        )
          .map((li) => txt(li.textContent))
          .filter(Boolean)
          .slice(0, 20)
      }
      out.floorplans = Array.from(document.querySelectorAll("img"))
        .map((i) => i.getAttribute("src") || "")
        .filter((u) => /floorplan/i.test(u))
        .slice(0, 10)

      out.statusText = txt(
        document.querySelector('[data-testid*="status"], [class*="Tag"], [class*="badge"]')?.textContent,
      )
      out.pageTextSample = (document.body.innerText || "").slice(0, 8000)
      if (out.strategy === "none" && (out.address || out.priceText)) out.strategy = "dom"
      return out
    })

    await closeBrightData(browser)

    if (!raw.address && !raw.priceText) {
      console.warn("[Zoopla-Listing] no usable data — page likely challenged/blocked")
      return null
    }

    const listing = normaliseZooplaRaw(raw, url)
    console.log("[Zoopla-Listing] extracted", {
      strategy: raw.strategy,
      price: listing.price,
      beds: listing.bedrooms,
      postcode: listing.postcode,
      images: listing.images.length,
    })
    return listing.price > 0 || listing.address ? listing : null
  } catch (err) {
    console.error(
      "[Zoopla-Listing] scrape error:",
      err instanceof Error ? err.message : String(err),
    )
    try {
      await closeBrightData(browser)
    } catch {
      /* ignore */
    }
    return null
  }
}

// ── Normalisation (Node side) ────────────────────────────────────────────

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

function parsePrice(text: string): number {
  if (!text) return 0
  // "£250,000", "Offers over £250,000", "250000"
  const m = text.replace(/,/g, "").match(/£?\s*(\d{4,9})/)
  return m ? parseInt(m[1], 10) : 0
}

function normalisePropertyType(raw: string, blob: string): string | null {
  const s = `${raw} ${blob}`.toLowerCase()
  if (/end[\s-]*(of[\s-]*)?terrace/.test(s)) return "end-terrace"
  if (/terrac/.test(s)) return "terraced"
  if (/semi[\s-]*detached/.test(s)) return "semi-detached"
  if (/detached/.test(s)) return "detached"
  if (/maisonette/.test(s)) return "maisonette"
  if (/bungalow/.test(s)) return "bungalow"
  if (/flat|apartment/.test(s)) return "flat"
  return null
}

/** Exported for unit tests — pure, no browser needed. */
export function normaliseZooplaRaw(raw: RawZoopla, url: string): ZooplaListing {
  const blob = [raw.description, raw.keyFeatures.join(" "), raw.pageTextSample]
    .filter(Boolean)
    .join(" ")

  const pcMatch = `${raw.address} ${blob}`.match(UK_POSTCODE_RE)
  const postcode = pcMatch ? `${pcMatch[1].toUpperCase()} ${pcMatch[2].toUpperCase()}` : ""

  // Bedrooms/bathrooms from text when the model didn't carry them.
  const bedText = blob.match(/(\d+)\s*bed/i)
  const bathText = blob.match(/(\d+)\s*bath/i)
  const bedrooms = raw.bedrooms ?? (bedText ? parseInt(bedText[1], 10) : null)
  const bathrooms = raw.bathrooms ?? (bathText ? parseInt(bathText[1], 10) : null)

  // Tenure
  const tenureSrc = `${raw.tenure} ${blob}`.toLowerCase()
  const tenure = /freehold/.test(tenureSrc)
    ? "freehold"
    : /leasehold|share of freehold/.test(tenureSrc)
      ? "leasehold"
      : null
  const leaseMatch = blob.match(/(\d{2,3})\s*years?\s*(remaining|left|lease)/i)

  // Floor area — "957 sq ft" / "89 sq m" / "89 m²"
  const areaSrc = `${raw.floorArea} ${blob}`
  const sqftM = areaSrc.match(/([\d,]+)\s*(?:sq\.?\s?ft|sqft|square feet)/i)
  const sqmM = areaSrc.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s?m|sqm|m²|square met)/i)
  const floorSizeSqft = sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : null
  const floorSizeM2 = sqmM ? Math.round(parseFloat(sqmM[1].replace(/,/g, ""))) : null

  const epcMatch =
    (raw.epcRating || "").match(/\b([A-G])\b/) ??
    blob.match(/EPC\s*(?:rating)?\s*[:\-–—]?\s*\b([A-G])\b/i)

  const statusSrc = `${raw.statusText} ${blob}`.toLowerCase()
  const idMatch = url.match(/details\/(\d+)/)

  return {
    address: raw.address.replace(/\s+/g, " ").trim(),
    postcode,
    price: parsePrice(raw.priceText || blob),
    priceText: raw.priceText,
    bedrooms,
    bathrooms,
    receptions: raw.receptions,
    propertyType: normalisePropertyType(raw.propertyType, blob),
    tenure,
    leaseYearsRemaining:
      tenure === "leasehold" && leaseMatch ? parseInt(leaseMatch[1], 10) : null,
    floorSizeSqft:
      floorSizeSqft ?? (floorSizeM2 ? Math.round(floorSizeM2 * 10.7639) : null),
    floorSizeM2: floorSizeM2 ?? (floorSizeSqft ? Math.round(floorSizeSqft / 10.7639) : null),
    images: Array.from(new Set(raw.images)).slice(0, 25),
    floorplans: Array.from(new Set(raw.floorplans)),
    description: raw.description || null,
    keyFeatures: raw.keyFeatures,
    epcRating: epcMatch ? epcMatch[1].toUpperCase() : null,
    councilTaxBand: extractCouncilTaxBand(raw.councilTaxBand, raw.keyFeatures, blob),
    listingId: idMatch ? idMatch[1] : null,
    listingUrl: url,
    agent: raw.agentName || null,
    agentPhone: raw.agentPhone || null,
    isSold: /sold\s*stc|sold\b/.test(statusSrc),
    isUnderOffer: /under offer/.test(statusSrc),
    scrapedAt: new Date().toISOString(),
    source: "brightdata_zoopla",
  }
}
