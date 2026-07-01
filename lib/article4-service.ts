/**
 * Article 4 Direction Lookup Service
 *
 * Queries the article4_areas table for a given postcode (or the full
 * dataset for the Leaflet map) and returns a normalised shape the
 * result card + AI prompt + map component can all consume.
 *
 * Reads go through whichever Supabase client the caller supplies:
 *   - server routes / API routes → createAdminClient()
 *   - client components (the map) → createClient() (browser)
 * Both have SELECT access via the RLS policy defined in
 * supabase/migrations/20260423_article4_areas.sql.
 *
 * All functions fail soft — if the table is missing, the query errors,
 * or the postcode is malformed, the service returns status 'unknown'
 * rather than throwing. The main analysis pipeline must never be
 * blocked by an Article 4 lookup (General Rules).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ── Types ─────────────────────────────────────────────────────────────────

export type Article4Status =
  | "active"
  | "proposed"
  | "consultation"
  | "revoked"

export type Article4WarningLevel = "red" | "amber" | "none"

export type Article4CheckStatus =
  | "active"
  | "proposed"
  | "none"
  | "unknown"

/** A single row from article4_areas — camelCase for the frontend. */
export interface Article4Area {
  id: string
  councilName: string
  councilCode: string | null
  region: string | null
  country: string | null
  directionType: string | null
  propertyTypesAffected: string[] | null
  boundaryGeojson: unknown | null
  postcodeDistricts: string[] | null
  postcodeSectors: string[] | null
  approximateCenterLat: number | null
  approximateCenterLng: number | null
  status: Article4Status
  confirmedDate: string | null
  proposedDate: string | null
  consultationEndDate: string | null
  effectiveDate: string | null
  impactDescription: string | null
  planningPortalUrl: string | null
  councilPlanningUrl: string | null
  sourceDocumentUrl: string | null
  verified: boolean
  dataSource: string | null
  lastVerifiedAt: string | null
}

export interface Article4CheckResult {
  isArticle4: boolean
  status: Article4CheckStatus
  areas: Article4Area[]
  warningLevel: Article4WarningLevel
  summary: string
  /** The postcode district we derived from the input (e.g. "M14"). */
  district: string | null
  /** The postcode sector we derived from the input (e.g. "M14 5"). */
  sector: string | null
}

// ── Raw row type (snake_case, direct from Postgres) ───────────────────────

interface Article4Row {
  id: string
  council_name: string
  council_code: string | null
  region: string | null
  country: string | null
  direction_type: string | null
  property_types_affected: string[] | null
  boundary_geojson: unknown | null
  postcode_districts: string[] | null
  postcode_sectors: string[] | null
  approximate_center_lat: number | null
  approximate_center_lng: number | null
  status: string
  confirmed_date: string | null
  proposed_date: string | null
  consultation_end_date: string | null
  effective_date: string | null
  impact_description: string | null
  planning_portal_url: string | null
  council_planning_url: string | null
  source_document_url: string | null
  verified: boolean | null
  data_source: string | null
  last_verified_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ALL_COLUMNS =
  "id,council_name,council_code,region,country,direction_type," +
  "property_types_affected,boundary_geojson,postcode_districts," +
  "postcode_sectors,approximate_center_lat,approximate_center_lng," +
  "status,confirmed_date,proposed_date,consultation_end_date," +
  "effective_date,impact_description,planning_portal_url," +
  "council_planning_url,source_document_url,verified,data_source," +
  "last_verified_at"

function normaliseStatus(s: string): Article4Status {
  const lower = s.toLowerCase()
  if (lower === "active" || lower === "proposed" || lower === "consultation" || lower === "revoked") {
    return lower
  }
  return "active"
}

function toArea(row: Article4Row): Article4Area {
  return {
    id: row.id,
    councilName: row.council_name,
    councilCode: row.council_code,
    region: row.region,
    country: row.country,
    directionType: row.direction_type,
    propertyTypesAffected: row.property_types_affected,
    boundaryGeojson: row.boundary_geojson,
    postcodeDistricts: row.postcode_districts,
    postcodeSectors: row.postcode_sectors,
    approximateCenterLat: row.approximate_center_lat,
    approximateCenterLng: row.approximate_center_lng,
    status: normaliseStatus(row.status),
    confirmedDate: row.confirmed_date,
    proposedDate: row.proposed_date,
    consultationEndDate: row.consultation_end_date,
    effectiveDate: row.effective_date,
    impactDescription: row.impact_description,
    planningPortalUrl: row.planning_portal_url,
    councilPlanningUrl: row.council_planning_url,
    sourceDocumentUrl: row.source_document_url,
    verified: row.verified === true,
    dataSource: row.data_source,
    lastVerifiedAt: row.last_verified_at,
  }
}

/**
 * Extract the outward code (district) and sector from a UK postcode.
 * Accepts loose input like "m14 5aa", "M14  5AA", "M145AA", "M14".
 * Returns { district, sector } with sector possibly null if the input
 * was too short to resolve one.
 */
export function parsePostcode(
  raw: string
): { district: string; sector: string | null } | null {
  if (!raw) return null
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "")
  if (!cleaned) return null

  // Outward code regex: 1–2 letters, 1–2 digits, optional trailing letter
  // (handles EC1A, WC2N, M1, M14, SW1A, B3, etc.)
  const match = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)([\d][A-Z]{2})?$/)
  if (!match) return null

  const district = match[1]
  // Sector = district + first digit of the inward code
  const inward = match[2]
  const sector = inward ? `${district} ${inward.charAt(0)}` : null

  return { district, sector }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Check whether a postcode falls within any known Article 4 direction.
 *
 * Match priority (best-match wins):
 *   1. Exact sector match (e.g. "LS6 1")
 *   2. District match (e.g. "LS6")
 *
 * Status precedence when multiple areas match the same postcode:
 *   active > consultation > proposed > revoked
 * So a district that is 'active' takes precedence over a 'proposed'
 * neighbour with the same coverage.
 */
// ── Live national Article 4 lookup ────────────────────────────────────────
// Authoritative source: planning.data.gov.uk `article-4-direction-area`
// dataset (~6,900 mapped directions, queried point-in-polygon). Postcodes are
// geocoded via postcodes.io (ONS data, no key). We keep only HMO-relevant
// directions (C3→C4) because that's what gates HMO viability. Fail-soft to
// "unknown" on any error; results cached 7 days in-memory (directions rarely
// change), so repeat analyses of the same postcode don't re-hit the APIs.

const POSTCODES_IO = "https://api.postcodes.io/postcodes/"
const PLANNING_DATA_A4 =
  "https://www.planning.data.gov.uk/entity.json?dataset=article-4-direction-area"

// Matches HMO / C4 directions in the free-text name/notes/description.
const HMO_DIRECTION_RE =
  /\bhmo\b|hous\w* in multiple occupation|multiple occupation|\bc4\b|c3\s*(?:to|-|–|→)\s*c4/i

// Directions clearly about something OTHER than HMO — so a match here means
// the A4 at this point does not restrict C3→C4 (e.g. basements, shopfronts,
// conservation areas, agricultural, offices→resi). Used to tell a
// "definitely-not-HMO" area apart from an opaquely-labelled one.
const NON_HMO_DIRECTION_RE =
  /basement|conservation|shopfront|agricultur|\boffice|\bretail|\bcommercial|demolition|boundary treatment|\bfence|\bgate|\bporch|micro.?generation|telecommunication|advertisement|woodland|hedgerow|\bfarm/i

type LiveStatus = "active" | "review" | "none" | "unknown"
interface LiveResult {
  status: LiveStatus
  councilName: string | null
  directionName: string | null
}

const LIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const liveCache = new Map<string, { at: number; result: LiveResult }>()

async function geocodePostcode(
  postcode: string
): Promise<{ lat: number; lng: number; council: string | null } | null> {
  try {
    const pc = postcode.replace(/\s+/g, "").toUpperCase()
    if (!pc) return null
    const r = await fetch(`${POSTCODES_IO}${encodeURIComponent(pc)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as {
      result?: { latitude?: number; longitude?: number; admin_district?: string }
    }
    const res = j?.result
    if (!res || typeof res.latitude !== "number" || typeof res.longitude !== "number") {
      return null
    }
    return { lat: res.latitude, lng: res.longitude, council: res.admin_district ?? null }
  } catch {
    return null
  }
}

async function checkArticle4Live(postcode: string): Promise<LiveResult> {
  const key = postcode.replace(/\s+/g, "").toUpperCase()
  if (key) {
    const hit = liveCache.get(key)
    if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.result
  }

  const geo = await geocodePostcode(postcode)
  if (!geo) return { status: "unknown", councilName: null, directionName: null }

  try {
    const url = `${PLANNING_DATA_A4}&longitude=${geo.lng}&latitude=${geo.lat}&limit=50`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) {
      // Transient upstream failure — report unknown, don't cache.
      return { status: "unknown", councilName: geo.council, directionName: null }
    }
    const j = (await r.json()) as { entities?: Array<Record<string, unknown>> }
    const entities = j?.entities ?? []
    // Classify each Article 4 area covering the point.
    let hmo: Record<string, unknown> | null = null
    let ambiguous = false
    for (const e of entities) {
      const blob = `${e.name ?? ""} ${e.notes ?? ""} ${e.description ?? ""}`
      if (HMO_DIRECTION_RE.test(blob)) {
        hmo = e
        break
      }
      // An area that isn't clearly non-HMO (e.g. an opaque code like "A4D01")
      // could still be an HMO direction — flag it for verification.
      if (!NON_HMO_DIRECTION_RE.test(blob)) ambiguous = true
    }
    let result: LiveResult
    if (hmo) {
      result = {
        status: "active",
        councilName: geo.council,
        directionName: String(hmo.notes || hmo.name || "HMO Article 4 Direction"),
      }
    } else if (ambiguous) {
      result = { status: "review", councilName: geo.council, directionName: null }
    } else {
      // Zero areas, or only clearly-non-HMO areas → no HMO restriction here.
      result = { status: "none", councilName: geo.council, directionName: null }
    }
    if (key) liveCache.set(key, { at: Date.now(), result })
    return result
  } catch {
    return { status: "unknown", councilName: geo.council, directionName: null }
  }
}

/** Synthesise an Article4Area for a live-confirmed HMO direction. */
function liveArea(live: LiveResult): Article4Area {
  return {
    id: "live",
    councilName: live.councilName ?? "Local planning authority",
    councilCode: null,
    region: null,
    country: null,
    directionType: "HMO C4",
    propertyTypesAffected: ["HMO"],
    boundaryGeojson: null,
    postcodeDistricts: null,
    postcodeSectors: null,
    approximateCenterLat: null,
    approximateCenterLng: null,
    status: "active",
    confirmedDate: null,
    proposedDate: null,
    consultationEndDate: null,
    effectiveDate: null,
    impactDescription: live.directionName,
    planningPortalUrl: "https://www.planning.data.gov.uk/",
    councilPlanningUrl: null,
    sourceDocumentUrl: null,
    verified: true,
    dataSource: "planning.data.gov.uk",
    lastVerifiedAt: null,
  }
}

/**
 * Merge the authoritative national lookup with the curated Supabase table.
 * Priority: any active → active (the table acts as an override so curated
 * directions still flag even if planning.data.gov.uk lacks that polygon);
 * table proposed → proposed; a *live* "none" is a definitive national result;
 * anything else is honest "unknown". Crucially the table's own "none" (which
 * it returns for any unmatched district) is NOT treated as authoritative, so
 * we never present a false "No Article 4" for areas outside the dataset.
 */
function mergeArticle4(
  live: LiveResult,
  table: Article4CheckResult,
  district: string | null,
  sector: string | null
): Article4CheckResult {
  const liveActive = live.status === "active"
  const tableActive = table.status === "active"

  if (liveActive || tableActive) {
    const councilName =
      (tableActive
        ? table.areas.find((a) => a.status === "active")?.councilName
        : null) ||
      live.councilName ||
      "your local planning authority"
    const areas: Article4Area[] = [
      ...(liveActive ? [liveArea(live)] : []),
      ...table.areas,
    ]
    return {
      isArticle4: true,
      status: "active",
      areas,
      warningLevel: "red",
      summary: `ARTICLE 4 IN FORCE: ${councilName} operates an HMO (C3→C4) Article 4 direction covering this location — HMO conversion requires full planning permission. Confirm the exact boundary with the LPA.`,
      district,
      sector,
    }
  }

  if (table.status === "proposed") {
    return { ...table, district, sector }
  }

  // An Article 4 direction covers the point but the national record doesn't
  // clearly state whether it restricts HMO (e.g. an opaque reference code).
  // Surface it as amber "verify" — never silently assume it's safe.
  if (live.status === "review") {
    return {
      isArticle4: false,
      status: "unknown",
      areas: [],
      warningLevel: "amber",
      summary: `An Article 4 direction covers this location, but the national record doesn't state whether it restricts HMO conversion. Confirm C3→C4 permitted-development rights with ${
        live.councilName ?? "the local planning authority"
      } before proceeding.`,
      district,
      sector,
    }
  }

  // Only a *live* "none" reflects an actual point check (national dataset
  // returned no HMO direction here). The table's "none" is a non-match, not
  // a guarantee — so it never produces a confident "none".
  if (live.status === "none") {
    return {
      isArticle4: false,
      status: "none",
      areas: table.areas,
      warningLevel: "none",
      summary: `No HMO Article 4 direction found for ${
        district ?? "this area"
      } in the national planning dataset — C3→C4 conversion is likely permitted development. National coverage can lag, so confirm with ${
        live.councilName ?? "the local planning authority"
      } before committing.`,
      district,
      sector,
    }
  }

  // Live lookup failed (geocode / API) and no curated match → honest unknown,
  // never a false "none".
  return {
    isArticle4: false,
    status: "unknown",
    areas: [],
    warningLevel: "none",
    summary: `Article 4 status could not be confirmed for ${
      district ?? "this postcode"
    } right now — verify HMO permitted-development rights with the local planning authority.`,
    district,
    sector,
  }
}

export async function checkArticle4(
  supabase: SupabaseClient,
  postcode: string
): Promise<Article4CheckResult> {
  const parsed = parsePostcode(postcode)
  const district = parsed?.district ?? null
  const sector = parsed?.sector ?? null
  // Authoritative national lookup + curated table override, in parallel.
  const [live, table] = await Promise.all([
    checkArticle4Live(postcode),
    checkArticle4Table(supabase, postcode),
  ])
  return mergeArticle4(live, table, district, sector)
}

async function checkArticle4Table(
  supabase: SupabaseClient,
  postcode: string
): Promise<Article4CheckResult> {
  const parsed = parsePostcode(postcode)
  if (!parsed) {
    return {
      isArticle4: false,
      status: "unknown",
      areas: [],
      warningLevel: "none",
      summary:
        "Article 4 status unknown — postcode could not be parsed. Verify with the local planning authority.",
      district: null,
      sector: null,
    }
  }

  const { district, sector } = parsed

  try {
    // One query covers both district and sector overlap via PostgREST's
    // array `cs` (contains) operator. We prefer an OR so we get rows that
    // match either the sector OR the district.
    const filters: string[] = [`postcode_districts.cs.{${district}}`]
    if (sector) {
      // PostgREST array literal — quote the sector because it contains a space
      filters.push(`postcode_sectors.cs.{"${sector}"}`)
    }
    const { data, error } = await supabase
      .from("article4_areas")
      .select(ALL_COLUMNS)
      .or(filters.join(","))
      .neq("status", "revoked")

    if (error) {
      // Table missing, RLS denied, network — fall through to 'unknown'.
      // Never throw; the caller is the main analysis pipeline.
      console.warn("[article4] lookup failed:", error.message)
      return buildUnknownResult(district, sector)
    }

    const rows = (data ?? []) as unknown as Article4Row[]
    const areas = rows.map(toArea)

    if (areas.length === 0) {
      return {
        isArticle4: false,
        status: "none",
        areas: [],
        warningLevel: "none",
        summary: `No Article 4 direction found for ${district}. C3→C4 HMO conversion may be permitted development — always verify with the local planning authority.`,
        district,
        sector,
      }
    }

    // Pick the "strongest" status across matching areas.
    const hasActive = areas.some((a) => a.status === "active")
    const hasProposed = areas.some(
      (a) => a.status === "proposed" || a.status === "consultation"
    )

    if (hasActive) {
      const primary = areas.find((a) => a.status === "active")!
      return {
        isArticle4: true,
        status: "active",
        areas,
        warningLevel: "red",
        summary: `ARTICLE 4 IN FORCE: ${primary.councilName}${
          primary.directionType ? ` — ${primary.directionType}` : ""
        } — HMO conversion requires full planning permission.`,
        district,
        sector,
      }
    }

    if (hasProposed) {
      const primary = areas.find(
        (a) => a.status === "proposed" || a.status === "consultation"
      )!
      return {
        isArticle4: false,
        status: "proposed",
        areas,
        warningLevel: "amber",
        summary: `ARTICLE 4 PROPOSED: ${primary.councilName} is consulting on a direction that may affect ${district}. Monitor closely — if confirmed, HMO conversion will require planning permission.`,
        district,
        sector,
      }
    }

    // All remaining matches are revoked (filtered above) — treat as none.
    return {
      isArticle4: false,
      status: "none",
      areas,
      warningLevel: "none",
      summary: `No active Article 4 direction for ${district}.`,
      district,
      sector,
    }
  } catch (err) {
    console.warn("[article4] unexpected error:", err)
    return buildUnknownResult(district, sector)
  }
}

function buildUnknownResult(
  district: string,
  sector: string | null
): Article4CheckResult {
  return {
    isArticle4: false,
    status: "unknown",
    areas: [],
    warningLevel: "none",
    summary: `Article 4 status unknown for ${district} — verify with the local planning authority.`,
    district,
    sector,
  }
}

/**
 * Return every Article 4 area for the Leaflet map. Excludes 'revoked'
 * by default (the map is about *current* restrictions). Caller can pass
 * { includeRevoked: true } to see historical directions.
 */
export async function getAllArticle4Areas(
  supabase: SupabaseClient,
  opts: { includeRevoked?: boolean } = {}
): Promise<Article4Area[]> {
  try {
    let query = supabase.from("article4_areas").select(ALL_COLUMNS)
    if (!opts.includeRevoked) {
      query = query.neq("status", "revoked")
    }
    const { data, error } = await query.order("status", { ascending: true })

    if (error) {
      console.warn("[article4] getAll failed:", error.message)
      return []
    }
    return ((data ?? []) as unknown as Article4Row[]).map(toArea)
  } catch (err) {
    console.warn("[article4] getAll unexpected error:", err)
    return []
  }
}

/**
 * All Article 4 directions for a specific council (useful for admin
 * tooling and the detail page). Match is case-insensitive contains.
 */
export async function getArticle4ByCouncil(
  supabase: SupabaseClient,
  councilName: string
): Promise<Article4Area[]> {
  if (!councilName) return []
  try {
    const { data, error } = await supabase
      .from("article4_areas")
      .select(ALL_COLUMNS)
      .ilike("council_name", `%${councilName}%`)
      .order("status", { ascending: true })

    if (error) {
      console.warn("[article4] getByCouncil failed:", error.message)
      return []
    }
    return ((data ?? []) as unknown as Article4Row[]).map(toArea)
  } catch (err) {
    console.warn("[article4] getByCouncil unexpected error:", err)
    return []
  }
}
