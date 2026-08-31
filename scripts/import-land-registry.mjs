#!/usr/bin/env node
/**
 * Land Registry Price Paid importer.
 *
 *   node scripts/import-land-registry.mjs --year 2025
 *   node scripts/import-land-registry.mjs --monthly            # ongoing top-up
 *   node scripts/import-land-registry.mjs --complete --from 2015
 *   node scripts/import-land-registry.mjs --file ./pp-2025.csv
 *
 * Streams the CSV line by line — a 4.5GB file is never held in memory — and
 * upserts in batches keyed on LR's transaction GUID, so re-running is
 * idempotent. Progress is checkpointed to `import_progress`, so an interrupted
 * run resumes with --resume instead of starting over.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * SIZE: the full 1995→now file is ~29M rows (roughly 8-12GB in Postgres once
 * indexed). --from 2015 takes about 11-12M of those — call it 3.5-5GB indexed,
 * a bit over a third of the full file. That is deliberately deeper than the
 * comps engine's default 24-month window needs: find_land_registry_comps takes
 * p_months, so a thin sector can widen to 48 or 60 and still find real sales,
 * and the depth supports price-trend work without a second import later.
 * Check the Postgres disk allowance before running it.
 */
import { createClient } from "@supabase/supabase-js"
import { createInterface } from "node:readline"
import { createReadStream } from "node:fs"
import { Readable } from "node:stream"

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return next && !next.startsWith("--") ? next : true
}
const has = (name) => argv.includes(`--${name}`)

const BASE = "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com"
const BATCH = Number(arg("batch", 2000))
const FROM_YEAR = arg("from") ? Number(arg("from")) : null
const DRY = has("dry-run")

// ── Supabase ────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!DRY && (!url || !key)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const supabase = DRY ? null : createClient(url, key, { auth: { persistSession: false } })

// ── Parsing (mirrors lib/discovery/landRegistry.ts) ─────────────────────────
function parseCsvLine(line) {
  const out = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q
    } else if (c === "," && !q) { out.push(cur); cur = "" } else cur += c
  }
  out.push(cur)
  return out
}

function splitPostcode(raw) {
  if (!raw) return null
  const m = raw.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)([0-9][A-Z]{2})$/)
  if (!m) return null
  return { postcode: `${m[1]} ${m[2]}`, outcode: m[1], sector: `${m[1]} ${m[2][0]}` }
}

const clean = (v) => { const s = (v ?? "").trim(); return s === "" ? null : s }

function parseLine(line) {
  if (!line.trim()) return null
  const f = parseCsvLine(line).map((s) => s.replace(/^"|"$/g, ""))
  if (f.length < 15) return null
  const txn = clean(f[0]); const price = Number(f[1])
  const rawDate = clean(f[2]); const pc = splitPostcode(f[3])
  if (!txn || !Number.isFinite(price) || price <= 0 || !rawDate || !pc) return null
  const soldDate = rawDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldDate)) return null
  return {
    txn_id: txn, price, sold_date: soldDate,
    postcode: pc.postcode, outcode: pc.outcode, sector: pc.sector,
    property_type: clean(f[4]),
    new_build: f[5] === "Y" ? true : f[5] === "N" ? false : null,
    tenure: clean(f[6]), paon: clean(f[7]), saon: clean(f[8]), street: clean(f[9]),
    locality: clean(f[10]), town: clean(f[11]), district_name: clean(f[12]),
    county: clean(f[13]), ppd_category: clean(f[14]),
    _status: clean(f[15]),
  }
}

// ── Source ──────────────────────────────────────────────────────────────────
async function openStream() {
  const file = arg("file")
  if (typeof file === "string") {
    console.log(`Reading local file ${file}`)
    return createReadStream(file)
  }
  let target
  if (has("monthly")) target = `${BASE}/pp-monthly-update-new-version.csv`
  else if (arg("year")) target = `${BASE}/pp-${arg("year")}.csv`
  else target = `${BASE}/pp-complete.csv`

  console.log(`Downloading ${target}`)
  const res = await fetch(target)
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`)
  return Readable.fromWeb(res.body)
}

// ── Run ─────────────────────────────────────────────────────────────────────
async function main() {
  const job = "land_registry_pp"
  let resumeAfter = null
  if (has("resume") && supabase) {
    const { data } = await supabase
      .from("import_progress").select("cursor_value, rows_done").eq("job", job).maybeSingle()
    if (data?.cursor_value) {
      resumeAfter = data.cursor_value
      console.log(`Resuming after txn ${resumeAfter} (${data.rows_done} rows done)`)
    }
  }

  const rl = createInterface({ input: await openStream(), crlfDelay: Infinity })

  let seen = 0, parsed = 0, written = 0, deleted = 0, skippedYear = 0, skippedBad = 0
  let batch = []
  let seeking = Boolean(resumeAfter)
  let lastTxn = null
  const t0 = Date.now()

  async function flush() {
    if (batch.length === 0) return
    if (DRY) { written += batch.length; batch = []; return }

    const dead = batch.filter((r) => r._status === "D").map((r) => r.txn_id)
    const live = batch.filter((r) => r._status !== "D").map(({ _status, ...r }) => r)

    if (dead.length) {
      const { error } = await supabase.from("land_registry_sales").delete().in("txn_id", dead)
      if (!error) deleted += dead.length
    }
    if (live.length) {
      const { error } = await supabase
        .from("land_registry_sales").upsert(live, { onConflict: "txn_id" })
      if (error) { console.error("  batch failed:", error.message); }
      else written += live.length
    }
    batch = []

    await supabase.from("import_progress").upsert({
      job, cursor_value: lastTxn, rows_done: written, status: "running",
      updated_at: new Date().toISOString(),
    }, { onConflict: "job" })
  }

  for await (const line of rl) {
    seen++
    const row = parseLine(line)
    if (!row) { skippedBad++; continue }

    // Resume: fast-forward until we pass the last committed transaction.
    if (seeking) {
      if (row.txn_id === resumeAfter) seeking = false
      continue
    }

    if (FROM_YEAR && Number(row.sold_date.slice(0, 4)) < FROM_YEAR) { skippedYear++; continue }

    parsed++
    lastTxn = row.txn_id
    batch.push(row)
    if (batch.length >= BATCH) {
      await flush()
      if (written % 50000 < BATCH) {
        const mins = ((Date.now() - t0) / 60000).toFixed(1)
        console.log(`  ${written.toLocaleString()} written · ${seen.toLocaleString()} read · ${mins}m`)
      }
    }
  }
  await flush()

  if (supabase) {
    await supabase.from("import_progress").upsert({
      job, cursor_value: lastTxn, rows_done: written, status: "done",
      notes: `read ${seen}, parsed ${parsed}, skipped ${skippedBad} bad / ${skippedYear} out-of-range`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "job" })
  }

  console.log("\n── Land Registry import complete ──")
  console.log(`  read        ${seen.toLocaleString()}`)
  console.log(`  usable      ${parsed.toLocaleString()}`)
  console.log(`  written     ${written.toLocaleString()}`)
  console.log(`  deleted     ${deleted.toLocaleString()}`)
  console.log(`  skipped     ${skippedBad.toLocaleString()} unusable, ${skippedYear.toLocaleString()} before ${FROM_YEAR}`)
  console.log(`  took        ${((Date.now() - t0) / 60000).toFixed(1)} min`)
}

main().catch((e) => { console.error(e); process.exit(1) })
