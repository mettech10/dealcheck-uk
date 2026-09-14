/**
 * Runs in the Rightmove listing MAIN world (user-initiated executeScript).
 * Collects PAGE_MODEL / DOM fields. Never copies photo or floorplan URLs.
 */
;(() => {
  function decodeIndexed(rawStr) {
    const arr = JSON.parse(rawStr)
    const cache = new Map()
    const decode = (i) => {
      if (typeof i !== "number") return i
      if (i === -1) return undefined
      if (i === -2) return NaN
      if (i === -3) return Infinity
      if (i === -4) return -Infinity
      if (i === -5) return -0
      if (cache.has(i)) return cache.get(i)
      const node = arr[i]
      if (node === null || typeof node !== "object") {
        cache.set(i, node)
        return node
      }
      if (Array.isArray(node)) {
        const list = []
        cache.set(i, list)
        for (const el of node) list.push(decode(el))
        return list
      }
      const obj = {}
      cache.set(i, obj)
      for (const [k, v] of Object.entries(node)) obj[k] = decode(v)
      return obj
    }
    return decode(0)
  }

  function getText(selector) {
    const el = document.querySelector(selector)
    return el?.textContent?.trim() ?? ""
  }

  function propertyData() {
    let pd = window.PAGE_MODEL && window.PAGE_MODEL.propertyData
    if (pd) return pd
    const encoded = window.__PAGE_MODEL
    if (encoded && typeof encoded.data === "string") {
      try {
        pd = decodeIndexed(encoded.data)?.propertyData
      } catch {
        pd = undefined
      }
    }
    return pd
  }

  function floorFromSizings(sizings) {
    let floorSizeSqft = null
    let floorSizeM2 = null
    if (!Array.isArray(sizings)) return { floorSizeSqft, floorSizeM2 }
    for (const s of sizings) {
      const size = Number(s && (s.maximumSize ?? s.minimumSize))
      if (!size) continue
      const unit = String((s && s.unit) || "")
      if (unit === "sqft" && !floorSizeSqft) floorSizeSqft = Math.round(size)
      if ((unit === "sqm" || unit === "m2") && !floorSizeM2) {
        floorSizeM2 = Math.round(size * 10) / 10
      }
    }
    return { floorSizeSqft, floorSizeM2 }
  }

  function collect() {
    const out = {
      href: location.href,
      fromPageModel: false,
      priceText: "",
      displayPriceQualifier: "",
      address: "",
      outcode: "",
      incode: "",
      bedrooms: null,
      bathrooms: null,
      propertySubType: "",
      tenureType: "",
      leaseYears: null,
      floorSizeSqft: null,
      floorSizeM2: null,
      description: "",
      keyFeatures: [],
      epcUrl: null,
      councilTaxBand: "",
      agentName: "",
      agentPhone: "",
      listingUpdateReason: "",
      statusText: "",
      pageTextSample: "",
    }

    const pd = propertyData()
    if (pd) {
      const floors = floorFromSizings(pd.sizings)
      out.fromPageModel = true
      out.priceText = String((pd.prices && pd.prices.primaryPrice) || "")
      out.displayPriceQualifier = String(
        (pd.prices && pd.prices.displayPriceQualifier) || "",
      )
      out.address = String((pd.address && pd.address.displayAddress) || "")
      out.outcode = String((pd.address && pd.address.outcode) || "")
      out.incode = String((pd.address && pd.address.incode) || "")
      out.bedrooms = typeof pd.bedrooms === "number" ? pd.bedrooms : null
      out.bathrooms = typeof pd.bathrooms === "number" ? pd.bathrooms : null
      out.propertySubType = String(pd.propertySubType || "")
      out.tenureType = String((pd.tenure && pd.tenure.tenureType) || "")
      out.leaseYears =
        pd.tenure &&
        typeof pd.tenure.yearsRemainingOnLease === "number" &&
        pd.tenure.yearsRemainingOnLease > 0
          ? pd.tenure.yearsRemainingOnLease
          : null
      out.floorSizeSqft = floors.floorSizeSqft
      out.floorSizeM2 = floors.floorSizeM2
      out.description = String((pd.text && pd.text.description) || "")
      out.keyFeatures = Array.isArray(pd.keyFeatures)
        ? pd.keyFeatures.map((f) => String(f))
        : []
      out.councilTaxBand = String(
        (pd.livingCosts && pd.livingCosts.councilTaxBand) || "",
      )
      out.agentName = String(
        (pd.customer &&
          (pd.customer.branchDisplayName || pd.customer.companyName)) ||
          "",
      )
      out.agentPhone = String(
        (pd.contactInfo &&
          pd.contactInfo.telephoneNumbers &&
          pd.contactInfo.telephoneNumbers.localNumber) ||
          "",
      )
      out.listingUpdateReason = String(
        (pd.listingHistory && pd.listingHistory.listingUpdateReason) || "",
      )
    }

    if (!out.priceText) {
      out.priceText = getText(
        '[data-testid="primaryPrice"], [data-testid="price-value"], .property-header-price',
      )
    }
    if (!out.address) {
      out.address = getText(
        'h1[class*="address"], [data-testid="address-label"], h1[itemprop="streetAddress"], h1',
      )
    }
    if (!out.description) {
      out.description = getText('[data-testid="description"], .property-description')
    }
    if (out.keyFeatures.length === 0) {
      out.keyFeatures = Array.from(
        document.querySelectorAll(
          'ul[class*="feature"] li, [data-testid="bullets"] li, .key-features li',
        ),
      )
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
    }
    if (!out.agentName) {
      out.agentName = getText('[data-testid="agent-name"], .agent-name')
    }
    out.statusText = getText(
      '[data-testid="banner"], [class*="propertyStatus"], [class*="soldBanner"]',
    )
    out.pageTextSample = (document.body.textContent || "").toLowerCase().slice(0, 5000)
    return out
  }

  try {
    globalThis.__METALYZI_SCREENER__ = collect()
  } catch (err) {
    globalThis.__METALYZI_SCREENER__ = {
      error: err instanceof Error ? err.message : String(err),
    }
  }
})()
