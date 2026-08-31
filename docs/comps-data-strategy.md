# Comparables data strategy

The rule: **Land Registry answers "are these sold prices real?" Rightmove
answers "what does this comp look like?"** — and the second only ever runs for
places we actually display.

A nationwide photo scrape is the expensive, fragile path. We don't take it.

---

## The four steps

### 1. Import Land Registry Price Paid — once, then monthly
Every sale in England & Wales, free and authoritative. No bedrooms, no floor
area, no photos — and that's fine, because this layer exists to make prices
trustworthy, not to render cards.

```bash
# First run — 2015 onward, deep enough to fall back on in thin sectors
node scripts/import-land-registry.mjs --complete --from 2015

# Ongoing: monthly delta (idempotent, keyed on LR's transaction GUID)
node scripts/import-land-registry.mjs --monthly
```

> **Check the disk allowance before you run it.** The full 1995→now file is
> ~4.5GB / ~29M rows, landing around 8–12GB in Postgres once indexed — likely
> more than the Supabase plan allows. `--from 2015` takes roughly 11–12M of
> those rows: call it **3.5–5GB indexed**, a bit over a third of the full file.
>
> Those are estimates, not measurements — England & Wales runs on the order of
> 1M transactions a year, so the figures scale with the span rather than being
> precise.
>
> 2015 is deliberately deeper than the *default* 24-month comp window consumes.
> The depth buys two things: `find_land_registry_comps` takes `p_months`, so a
> thin sector can widen to 48 or 60 months and still find category-A sales
> instead of returning nothing, and long-run price trends become answerable
> without a second import. If disk gets tight, `--from 2021` (~5–6M rows,
> ~1.5–2.5GB) still covers the default window on its own.

Lands in `land_registry_sales`, indexed by sector, outcode and date.

### 2. Geo — the join that makes national data usable
LR gives a postcode, not coordinates. Geocoding 29M rows individually is
absurd; geocoding ~1.8M *postcodes* once is not.

```bash
# Seed just the markets you serve (minutes)
node scripts/import-postcode-geo.mjs --outcodes M,B,LS,S,L,NE,CV,LE

# Full national precision — ONS Postcode Directory
# (download from geoportal.statistics.gov.uk)
node scripts/import-postcode-geo.mjs --file ./ONSPD.csv
```

`find_land_registry_comps()` joins `land_registry_sales → postcode_geo` and runs
a PostGIS radius query off the centroid. Accurate enough for a 1-mile comp
radius.

> Outcode centroids (`--outcodes`) are coarse — 2–4km. Fine for seeding, but
> load the ONS file before trusting tight radii.

### 3. Enrich on demand, then cache
When someone analyses M13, scrape **that sector only** — roughly 20–80 comps
with photos, beds and floor areas. Seconds the first time, instant afterwards.

`comp_coverage` records which sector has been enriched, when, and how many comps
came back, so the on-demand path knows whether to scrape or serve what's stored.
Enriched rows land in `property_sales` via `ingestSoldComps()`.

### 4. Warm the cache for real markets
Preload only cities we already serve, last 18–24 months, for the types and bed
counts we actually show. Thousands of properties, not millions — overnight, not
a national crawl.

---

## How the two layers combine at query time

| | `property_sales` (enriched) | `land_registry_sales` (backbone) |
| --- | --- | --- |
| Coverage | sectors we've scraped | all England & Wales |
| Price / date | ✅ | ✅ |
| Bedrooms | ✅ | ❌ |
| Floor area / £psf | ✅ | ❌ |
| Photos | ✅ | ❌ |
| Geo precision | exact | postcode centroid |
| Cost | a scrape | free |

The valuation engine already tolerates the gaps: unknown bedrooms take a mild
similarity penalty rather than disqualifying a comp, and `£/sqft` is simply
omitted when no comp reports a floor area.

**Category B is excluded.** LR marks repossessions, transfers under power of
sale and other non-open-market deals as category B. Including them would drag
comps below market and manufacture false "BMV" findings, so
`find_land_registry_comps` filters to category A only.

---

## Where this is today

| | |
| --- | --- |
| Schema + geo query | ✅ applied to production |
| Importers | ✅ written, **not yet run** |
| `land_registry_sales` | ⏳ empty |
| `postcode_geo` | ⏳ empty |
| `property_sales` | ⏳ empty |

Nothing has been imported: the build sandbox has no outbound network and no
service-role key, so the importers were verified by unit-testing the parser
(18 cases) and by exercising the SQL against the live database with seeded rows,
which were then deleted. First real run has to happen somewhere with
`SUPABASE_SERVICE_ROLE_KEY` and internet.

**Suggested order:** postcode geo for your markets → LR `--from 2015` → then the
BMV finder has a real comp set to work against on its first run.
