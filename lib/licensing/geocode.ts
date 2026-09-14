import { parsePostcode } from "@/lib/article4-service"
import type { LicensingGeo, LicensingNation } from "./types"

const POSTCODES_IO = "https://api.postcodes.io/postcodes/"

function toNation(raw: string | null | undefined): LicensingNation {
  const s = (raw ?? "").trim()
  if (s === "England" || s === "Scotland" || s === "Wales" || s === "Northern Ireland") {
    return s
  }
  return "unknown"
}

/**
 * Resolve a UK postcode to country + council via postcodes.io (ONS).
 * Fail-soft: returns null on network / 404 / malformed.
 */
export async function geocodeLicensingPostcode(
  postcode: string,
): Promise<LicensingGeo | null> {
  const parsed = parsePostcode(postcode)
  const compact = postcode.replace(/\s+/g, "").toUpperCase()
  if (!compact) return null

  try {
    const r = await fetch(`${POSTCODES_IO}${encodeURIComponent(compact)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as {
      result?: {
        postcode?: string
        country?: string
        admin_district?: string
      }
    }
    const res = j?.result
    if (!res) return null
    return {
      postcode: res.postcode ?? (parsed ? `${parsed.district}${parsed.sector ? " " + parsed.sector.split(" ")[1] : ""}` : compact),
      country: toNation(res.country),
      council: res.admin_district ?? null,
      district: parsed?.district ?? null,
      sector: parsed?.sector ?? null,
    }
  } catch {
    return null
  }
}
