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
# Scoped to the areas you serve — this is the one that fits a free plan
node scripts/import-land-registry.mjs --complete --from 2015 --areas M,B,LS

# National, 2015 onward — needs a paid plan (see the sizing table)
node scripts/import-land-registry.mjs --complete --from 2015

# Ongoing: monthly delta (idempotent, keyed on LR's transaction GUID)
node scripts/import-land-registry.mjs --monthly --areas M,B,LS
```

`--areas` scopes by postcode area: a letters-only token (`M`) takes the whole
area, a token with digits (`M13`) takes one outcode, and `M` does **not** swallow
`MK` or `ME`. Both importers take the same flag, and they must be given the same
scope — an LR sale whose postcode has no `postcode_geo` row is invisible to the
radius query.

### Sizing — measured, not estimated

402 bytes/row for `land_registry_sales` and 239 bytes/row for `postcode_geo`,
table plus indexes, measured on Supabase Postgres 17 by inserting a sample and
reading `pg_total_relation_size`.

| Scope | LR rows | LR size | + postcodes | Total |
| --- | --- | --- | --- | --- |
| `--areas M,B,LS`, from 2015 | ~0.6M | ~230MB | ~20MB | **~250MB** |
| National, from 2015 | ~11.5M | ~4.6GB | ~430MB | **~5GB** |
| National, all history | ~29M | ~11GB | ~430MB | **~11.5GB** |

Row counts are estimates (England & Wales runs on the order of 1M transactions a
year); the bytes-per-row multiplier is not.

> **The free plan caps the database at 500MB.** National doesn't fit — the ONS
> postcode file alone would nearly fill it. Either scope with `--areas`, or move
> to a paid plan before importing nationally.

2015 is deliberately deeper than the *default* 24-month comp window consumes.
The depth buys two things: `find_land_registry_comps` takes `p_months`, so a thin
sector can widen to 48 or 60 months and still find category-A sales instead of
returning nothing, and long-run price trends become answerable without a second
import.

Lands in `land_registry_sales`, indexed by sector, outcode and date.

### 2. Geo — the join that makes national data usable
LR gives a postcode, not coordinates. Geocoding 29M rows individually is
absurd; geocoding ~1.8M *postcodes* once is not.

```bash
# Per-postcode precision for the areas you serve — run this BEFORE the LR
# import, and with the same --areas scope
node scripts/import-postcode-geo.mjs --file ./ONSPD.csv --areas M,B,LS

# Coarse outcode centroids, no download needed (postcodes.io, minutes)
node scripts/import-postcode-geo.mjs --outcodes M,B,LS,S,L,NE,CV,LE

# Full national precision — ~1.8M rows, ~430MB
node scripts/import-postcode-geo.mjs --file ./ONSPD.csv
```

ONSPD download: geoportal.statistics.gov.uk → search "ONS Postcode Directory" →
take the latest release, unzip, and point `--file` at
`Data/ONSPD_<MON>_<YEAR>_UK.csv`. It's a ~1GB zip; only the columns `pcds`,
`lat` and `long` are read.

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
(24 cases), by running the area filter against a fixture end-to-end, and by
exercising the SQL against the live database with seeded rows, which were then
deleted. First real run has to happen somewhere with `SUPABASE_SERVICE_ROLE_KEY`
and internet.

---

## Running the first import

1. **Get the service-role key.** Supabase dashboard → project `supabase-matalyzi`
   → Settings → API → `service_role`. It bypasses RLS, so keep it out of git and
   off the client — `.env.local` is gitignored.

   ```bash
   # in dealcheck-uk/.env.local
   NEXT_PUBLIC_SUPABASE_URL=https://lftlugydvvctjujalzwh.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```

2. **Decide the scope.** Whichever postcode areas you actually serve. Every extra
   city area is roughly 60–90MB.

3. **Postcodes first** — LR rows with no matching `postcode_geo` row are invisible
   to the radius query.

   ```bash
   cd dealcheck-uk
   set -a && source .env.local && set +a
   node scripts/import-postcode-geo.mjs --file ./ONSPD.csv --areas M,B,LS
   ```

4. **Then Land Registry**, same scope. Expect a few hours: the writes go through
   PostgREST in batches of 2000, so it is network-bound, not CPU-bound.

   ```bash
   node scripts/import-land-registry.mjs --complete --from 2015 --areas M,B,LS
   ```

   It checkpoints to `import_progress`, so if it dies, `--resume` picks up where
   it stopped rather than starting the 4.5GB download over.

5. **Check it landed.**

   ```sql
   SELECT count(*), min(sold_date), max(sold_date) FROM land_registry_sales;
   SELECT pg_size_pretty(pg_database_size(current_database()));
   -- Manchester city centre, 1 mile, terraced, last 24 months
   SELECT * FROM find_land_registry_comps(53.4808, -2.2426, 1600, 'T', 24, 10);
   ```

6. **Keep it current** — `--monthly --areas M,B,LS` on a cron. It is keyed on LR's
   transaction GUID, so re-running is idempotent rather than additive.

**Dry run first if you want to see the shape without writing:** add `--dry-run`
to the LR importer and it parses, filters and counts without touching the
database or needing a key.

**Suggested order:** postcode geo for your markets → LR `--from 2015` → then the
BMV finder has a real comp set to work against on its first run.
