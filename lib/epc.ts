/**
 * EPC band lookup — fetches a property's current Energy Performance
 * Certificate band (A–G) from the government EPC register by postcode, then
 * matches the specific address where possible.
 *
 * Fail-soft: returns { band: null } on any error (missing token, no
 * certificate, network, no confident address match) so it never blocks an
 * analysis. Server-only — uses the EPC API token.
 *
 * We deliberately return a band ONLY when we can tie it to the right
 * property (address/house-number match, or a single certificate for the
 * postcode). A neighbour's band would be worse than "unknown".
 */

const EPC_SEARCH =
  "https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search"

const VALID_BANDS = new Set(["A", "B", "C", "D", "E", "F", "G"])

function epcToken(): string {
  return (
    process.env.EPC_API_TOKEN ||
    process.env.EPC_TOKEN ||
    process.env.EPC_BEARER_TOKEN ||
    process.env.EPC_API_KEY ||
    ""
  )
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Leading house number/identifier of an address, e.g. "12A Oak St" → "12a". */
function houseId(address: string): string | null {
  const m = (address || "").trim().match(/^(?:flat\s*\d+[,\s]+)?(\d+[a-z]?)\b/i)
  return m ? m[1].toLowerCase() : null
}

function bandOf(r: Record<string, unknown>): string | null {
  const b = String(
    r["currentEnergyEfficiencyBand"] ??
      r["current-energy-rating"] ??
      r["currentEnergyRating"] ??
      "",
  )
    .trim()
    .toUpperCase()
  return VALID_BANDS.has(b) ? b : null
}

function addrLine1(r: Record<string, unknown>): string {
  return String(
    r["addressLine1"] ?? r["address1"] ?? r["address"] ?? r["addressLine"] ?? "",
  )
}

export interface EpcResult {
  band: string | null
  /** Register source when a band was resolved, else null. */
  source: "epc-register" | null
}

export async function getEpcBand(
  postcode: string,
  address?: string,
): Promise<EpcResult> {
  const token = epcToken()
  const pc = (postcode || "").replace(/\s+/g, "").toUpperCase()
  if (!token || !pc) return { band: null, source: null }

  try {
    const url = `${EPC_SEARCH}?postcode=${encodeURIComponent(pc)}&size=50`
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return { band: null, source: null }

    const j = (await res.json()) as
      | { data?: unknown; rows?: unknown; results?: unknown }
      | unknown[]
    const rows = (
      Array.isArray(j)
        ? j
        : ((j as { data?: unknown }).data ??
            (j as { rows?: unknown }).rows ??
            (j as { results?: unknown }).results ??
            [])
    ) as Array<Record<string, unknown>>

    const withBand = rows.filter((r) => bandOf(r))
    if (withBand.length === 0) return { band: null, source: null }

    // 1) Confident address match (house number + street token overlap).
    if (address) {
      const targetKey = norm(address)
      const targetHouse = houseId(address)
      const targetStreet = norm(address.replace(/^[^a-zA-Z]*\d+[a-z]?\s*/i, "")).slice(0, 10)

      const match = withBand.find((r) => {
        const line = addrLine1(r)
        const rowKey = norm(line)
        const rowHouse = houseId(line)
        // House number must agree if both have one.
        if (targetHouse && rowHouse && targetHouse !== rowHouse) return false
        // Require some street overlap so we don't match a random cert.
        const streetOverlap =
          !!targetStreet && (rowKey.includes(targetStreet) || targetKey.includes(norm(line).slice(0, 10)))
        return (!!targetHouse && targetHouse === rowHouse && (streetOverlap || rowKey === targetKey)) ||
          rowKey === targetKey
      })
      if (match) {
        const b = bandOf(match)
        if (b) return { band: b, source: "epc-register" }
      }
    }

    // 2) Only one certificate for the whole postcode → safe to use it.
    if (withBand.length === 1) {
      const b = bandOf(withBand[0])
      if (b) return { band: b, source: "epc-register" }
    }

    // Multiple certs and no confident match → don't guess.
    return { band: null, source: null }
  } catch {
    return { band: null, source: null }
  }
}
