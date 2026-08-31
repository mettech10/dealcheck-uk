#!/usr/bin/env node
/**
 * Postcode centroid loader — the join that lets national Land Registry data
 * take part in a geo radius query without geocoding 29M rows individually.
 *
 *   node scripts/import-postcode-geo.mjs --outcodes M,B,LS,S,L,NE,CV,LE
 *   node scripts/import-postcode-geo.mjs --file ./ONSPD.csv --areas M,B,LS
 *   node scripts/import-postcode-geo.mjs --file ./ONSPD.csv
 *
 * Two sources:
 *
 *   --outcodes  postcodes.io bulk API. Free, no key, no bulk download. Good
 *               for seeding just the markets you serve (step 3 of the strategy)
 *               — start here, it's minutes not hours.
 *
 *   --file      the ONS Postcode Directory CSV (all ~1.8M UK postcodes).
 *               Download from geoportal.statistics.gov.uk. True per-postcode
 *               precision. Expects columns named pcds, lat, long.
 *               Add --areas to load only the areas you serve — all 1.8M rows
 *               cost ~430MB (239 bytes/row measured), which on its own would
 *               fill a 500MB free plan.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js"
import { createInterface } from "node:readline"
import { createReadStream } from "node:fs"

const argv = process.argv.slice(2)
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  if (i === -1) return d
  const v = argv[i + 1]
  return v && !v.startsWith("--") ? v : true
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })
const BATCH = Number(arg("batch", 1000))

// Same scoping rule as the Land Registry importer: letters-only takes the
// whole area, a token with digits takes one outcode, empty means no filter.
const AREAS = typeof arg("areas") === "string"
  ? arg("areas").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : []

function inScope(outcode) {
  if (AREAS.length === 0) return true
  const oc = outcode.toUpperCase()
  const area = (oc.match(/^[A-Z]{1,2}/)?.[0] ?? "")
  return AREAS.some((t) => (/\d/.test(t) ? oc === t : area === t))
}

function split(pc) {
  if (!pc) return null
  const m = pc.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)([0-9][A-Z]{2})$/)
  if (!m) return null
  return { postcode: `${m[1]} ${m[2]}`, outcode: m[1], sector: `${m[1]} ${m[2][0]}` }
}

async function writeBatch(rows) {
  if (!rows.length) return 0
  const { error } = await supabase.from("postcode_geo").upsert(rows, { onConflict: "postcode" })
  if (error) { console.error("  batch failed:", error.message); return 0 }
  return rows.length
}

/** ONS Postcode Directory CSV → postcode_geo */
async function fromFile(path) {
  console.log(`Reading ${path}`)
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let header = null, iPc = -1, iLat = -1, iLng = -1
  let batch = [], written = 0, skipped = 0, outOfArea = 0

  for await (const line of rl) {
    const cells = line.split(",").map((s) => s.replace(/^"|"$/g, "").trim())
    if (!header) {
      header = cells.map((h) => h.toLowerCase())
      iPc = header.findIndex((h) => h === "pcds" || h === "postcode")
      iLat = header.indexOf("lat")
      iLng = header.findIndex((h) => h === "long" || h === "lng" || h === "longitude")
      if (iPc === -1 || iLat === -1 || iLng === -1) {
        throw new Error(`Could not find pcds/lat/long columns in header: ${header.slice(0, 12)}`)
      }
      continue
    }
    const p = split(cells[iPc])
    const lat = Number(cells[iLat]), lng = Number(cells[iLng])
    // ONS uses 99.999999 for "no grid reference"
    if (!p || !Number.isFinite(lat) || !Number.isFinite(lng) || lat > 62 || lat < 49) { skipped++; continue }
    if (!inScope(p.outcode)) { outOfArea++; continue }

    batch.push({ postcode: p.postcode, outcode: p.outcode, sector: p.sector, latitude: lat, longitude: lng })
    if (batch.length >= BATCH) {
      written += await writeBatch(batch); batch = []
      if (written % 100000 < BATCH) console.log(`  ${written.toLocaleString()} written`)
    }
  }
  written += await writeBatch(batch)
  console.log(
    `\nDone: ${written.toLocaleString()} postcodes, ${skipped.toLocaleString()} skipped` +
    (AREAS.length ? `, ${outOfArea.toLocaleString()} outside ${AREAS.join("/")}` : ""),
  )
}

/** postcodes.io — seed just the outcodes we serve */
async function fromOutcodes(list) {
  const outcodes = list.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  console.log(`Seeding ${outcodes.length} outcode families via postcodes.io`)
  let written = 0

  for (const oc of outcodes) {
    try {
      // Every postcode inside the outcode, via the autocomplete-free lookup.
      const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(oc)}`)
      if (!res.ok) { console.warn(`  ${oc}: HTTP ${res.status}`); continue }
      const json = await res.json()
      const lat = json?.result?.latitude, lng = json?.result?.longitude
      if (typeof lat !== "number" || typeof lng !== "number") { console.warn(`  ${oc}: no centroid`); continue }

      // Outcode centroid as a coarse fallback row. Sector/unit precision comes
      // from the ONS file; this is enough to place LR sales within ~1 mile.
      written += await writeBatch([{
        postcode: `${oc} 0AA`, outcode: oc, sector: `${oc} 0`, latitude: lat, longitude: lng,
      }])
      console.log(`  ${oc} → ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      await new Promise((r) => setTimeout(r, 250)) // be polite
    } catch (e) {
      console.warn(`  ${oc}: ${e.message}`)
    }
  }
  console.log(`\nDone: ${written} outcode centroids.`)
  console.log("NOTE: outcode centroids are coarse (~2-4km). Load the ONS file with")
  console.log("      --file for true per-postcode precision before trusting tight radii.")
}

const file = arg("file")
const outcodes = arg("outcodes")
if (typeof file === "string") await fromFile(file)
else if (typeof outcodes === "string") await fromOutcodes(outcodes)
else {
  console.error("Give --file <ONSPD.csv> or --outcodes M,B,LS")
  process.exit(1)
}
