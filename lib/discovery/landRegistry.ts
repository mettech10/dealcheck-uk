/**
 * Land Registry Price Paid — parsing and ingestion.
 *
 * PPD is the free, authoritative record of every property sale in England &
 * Wales since 1995. It answers "are these sold prices real?" at national scale.
 * It publishes NO bedrooms, floor area or photos — that enrichment only ever
 * happens for sectors we actually display (see comp_coverage).
 *
 * File layout (headerless CSV, one row per transaction):
 *   0 txn_id            {GUID}
 *   1 price
 *   2 date_of_transfer  YYYY-MM-DD HH:MM
 *   3 postcode
 *   4 property_type     D|S|T|F|O
 *   5 old_new           Y|N
 *   6 duration          F|L
 *   7 PAON              house number / name
 *   8 SAON              flat / sub-building
 *   9 street
 *  10 locality
 *  11 town_city
 *  12 district
 *  13 county
 *  14 ppd_category      A standard, B additional
 *  15 record_status     A add, C change, D delete
 *
 * Everything here is pure parsing plus batched writes — no LLM, no scraping.
 */
import type { createAdminClient } from "@/lib/supabase/admin"

type Supa = ReturnType<typeof createAdminClient>

export const LR_DOWNLOAD = {
  /** Everything since 1995 — ~4.5GB, ~29M rows. */
  complete:
    "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv",
  /** Just the latest monthly delta — use this for ongoing top-ups. */
  monthly:
    "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv",
  /** One calendar year, e.g. year(2025). Much lighter than `complete`. */
  year: (y: number) =>
    `http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-${y}.csv`,
}

export interface LandRegistryRow {
  txnId: string
  price: number
  soldDate: string // YYYY-MM-DD
  postcode: string
  outcode: string
  sector: string
  propertyType: string | null
  newBuild: boolean | null
  tenure: string | null
  paon: string | null
  saon: string | null
  street: string | null
  locality: string | null
  town: string | null
  districtName: string | null
  county: string | null
  ppdCategory: string | null
  /** 'D' rows are deletions — the caller should remove, not insert. */
  recordStatus: string | null
}

/**
 * Split one CSV line respecting quotes. LR quotes every field, and addresses
 * legitimately contain commas ("FLAT 3, THE OLD BAKERY"), so a naive split
 * corrupts the row.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"' // escaped quote
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

const UK_PC = /^([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})$/

/** Normalise to 'M13 9PL' and derive outcode + sector, or null if unusable. */
export function splitPostcode(
  raw: string | null | undefined,
): { postcode: string; outcode: string; sector: string } | null {
  if (!raw) return null
  const m = raw.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)([0-9][A-Z]{2})$/)
  if (!m) return null
  const outcode = m[1]
  const postcode = `${outcode} ${m[2]}`
  return { postcode, outcode, sector: `${outcode} ${m[2][0]}` }
}

const clean = (v: string | undefined): string | null => {
  const s = (v ?? "").trim()
  return s === "" ? null : s
}

/**
 * Parse one PPD line. Returns null when the row can't be used — no postcode
 * (a meaningful share of LR rows omit it, and without one we can't place it),
 * no price, or an unparseable date.
 */
export function parseLandRegistryLine(line: string): LandRegistryRow | null {
  if (!line.trim()) return null
  const f = parseCsvLine(line).map((s) => s.replace(/^"|"$/g, ""))
  if (f.length < 15) return null

  const txnId = clean(f[0])
  const price = Number(f[1])
  const rawDate = clean(f[2])
  const pc = splitPostcode(f[3])

  if (!txnId || !Number.isFinite(price) || price <= 0 || !rawDate || !pc) return null

  // "2025-03-12 00:00" → "2025-03-12"
  const soldDate = rawDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldDate)) return null

  return {
    txnId,
    price,
    soldDate,
    postcode: pc.postcode,
    outcode: pc.outcode,
    sector: pc.sector,
    propertyType: clean(f[4]),
    newBuild: f[5] === "Y" ? true : f[5] === "N" ? false : null,
    tenure: clean(f[6]),
    paon: clean(f[7]),
    saon: clean(f[8]),
    street: clean(f[9]),
    locality: clean(f[10]),
    town: clean(f[11]),
    districtName: clean(f[12]),
    county: clean(f[13]),
    ppdCategory: clean(f[14]),
    recordStatus: clean(f[15]),
  }
}

/**
 * Postcode area — the letters at the front of an outcode. 'M13' → 'M',
 * 'LS6' → 'LS'. The natural unit for "the cities we serve".
 */
export function postcodeArea(outcode: string): string {
  return (outcode.match(/^[A-Z]{1,2}/i)?.[0] ?? "").toUpperCase()
}

/**
 * Does this outcode fall inside the requested scope? Tokens are matched
 * loosely on purpose: a letters-only token ('M') takes the whole area, a
 * token with digits ('M13') takes just that outcode. Mixing both is fine.
 *
 * An empty scope means "no filter" — everything matches.
 */
export function matchesAreas(outcode: string, scope: string[]): boolean {
  if (scope.length === 0) return true
  const oc = outcode.toUpperCase()
  const area = postcodeArea(oc)
  return scope.some((t) => {
    const token = t.trim().toUpperCase()
    if (!token) return false
    return /\d/.test(token) ? oc === token : area === token
  })
}

/** Map an LR type code to the family the comps engine reasons about. */
export function lrTypeToFamily(code: string | null): string {
  switch ((code ?? "").toUpperCase()) {
    case "D": return "detached"
    case "S": return "semi"
    case "T": return "terraced"
    case "F": return "flat"
    default: return "other"
  }
}

/** Reverse map, for querying LR by the subject property's type. */
export function familyToLrType(family: string): string | null {
  switch (family) {
    case "detached": return "D"
    case "semi": return "S"
    case "terraced": return "T"
    case "flat": return "F"
    default: return null
  }
}

const toRow = (r: LandRegistryRow) => ({
  txn_id: r.txnId,
  price: r.price,
  sold_date: r.soldDate,
  postcode: r.postcode,
  outcode: r.outcode,
  sector: r.sector,
  property_type: r.propertyType,
  new_build: r.newBuild,
  tenure: r.tenure,
  paon: r.paon,
  saon: r.saon,
  street: r.street,
  locality: r.locality,
  town: r.town,
  district_name: r.districtName,
  county: r.county,
  ppd_category: r.ppdCategory,
})

/**
 * Upsert a batch. Keyed on LR's own transaction GUID, so re-running an import
 * or applying a monthly delta is idempotent rather than additive.
 */
export async function upsertLandRegistryBatch(
  supabase: Supa,
  rows: LandRegistryRow[],
): Promise<{ written: number; deleted: number; error?: string }> {
  const live = rows.filter((r) => r.recordStatus !== "D")
  const dead = rows.filter((r) => r.recordStatus === "D")

  let deleted = 0
  if (dead.length > 0) {
    const { error } = await supabase
      .from("land_registry_sales")
      .delete()
      .in("txn_id", dead.map((r) => r.txnId))
    if (!error) deleted = dead.length
  }

  if (live.length === 0) return { written: 0, deleted }

  const { error } = await supabase
    .from("land_registry_sales")
    .upsert(live.map(toRow), { onConflict: "txn_id", ignoreDuplicates: false })

  if (error) return { written: 0, deleted, error: error.message }
  return { written: live.length, deleted }
}

/** Record how far an import got, so a interrupted run can resume. */
export async function saveProgress(
  supabase: Supa,
  job: string,
  cursor: string,
  rowsDone: number,
  status = "running",
  notes?: string,
): Promise<void> {
  await supabase.from("import_progress").upsert(
    {
      job,
      cursor_value: cursor,
      rows_done: rowsDone,
      status,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "job" },
  )
}

export async function readProgress(
  supabase: Supa,
  job: string,
): Promise<{ cursor: string | null; rowsDone: number } | null> {
  const { data } = await supabase
    .from("import_progress")
    .select("cursor_value, rows_done")
    .eq("job", job)
    .maybeSingle()
  if (!data) return null
  const row = data as { cursor_value: string | null; rows_done: number | null }
  return { cursor: row.cursor_value, rowsDone: row.rows_done ?? 0 }
}
