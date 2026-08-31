-- ═══════════════════════════════════════════════════════════════════════════
-- Land Registry backbone + sector-level comp coverage
-- ═══════════════════════════════════════════════════════════════════════════
-- Strategy (see docs/comps-data-strategy.md):
--   Land Registry Price Paid answers "are these sold prices real?" at national
--   scale — every transaction in England & Wales, free, authoritative, but with
--   NO bedrooms, floor area or photos.
--   Rightmove sold scraping answers "what does this comp look like?" and is
--   only ever run for sectors we actually display.
--
-- So LR gets its own table rather than going through `properties`:
--   • millions of rows would need a canonical property + geocode each, which is
--     enormous and buys nothing — LR rows are never displayed as rich cards
--   • geo comes from a postcode centroid join instead, which is accurate enough
--     for a 1-mile comp radius and costs one small lookup table
--
-- `property_sales` stays the enriched layer (beds, sqft, photos, precise geo).
-- The comps engine reads BOTH and prefers the enriched row when it exists.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Postcode centroids ────────────────────────────────────────────────────
-- ~1.8M UK postcodes. Small, static, and the thing that lets national LR data
-- participate in a geo radius query without per-row geocoding.
CREATE TABLE IF NOT EXISTS postcode_geo (
  postcode   VARCHAR(10) PRIMARY KEY,   -- normalised, e.g. 'M13 9PL'
  outcode    VARCHAR(5)  NOT NULL,      -- 'M13'
  sector     VARCHAR(8)  NOT NULL,      -- 'M13 9'  ← the caching unit
  latitude   NUMERIC(9,6),
  longitude  NUMERIC(9,6),
  geog GEOGRAPHY(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
      END
    ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postcode_geo_geog   ON postcode_geo USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_postcode_geo_sector ON postcode_geo(sector);
CREATE INDEX IF NOT EXISTS idx_postcode_geo_outcode ON postcode_geo(outcode);

-- ── Land Registry Price Paid ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS land_registry_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- LR's own transaction GUID — makes re-importing a file idempotent and lets
  -- monthly updates upsert cleanly.
  txn_id     TEXT NOT NULL UNIQUE,

  price      NUMERIC(12,2) NOT NULL,
  sold_date  DATE NOT NULL,

  postcode   VARCHAR(10),
  outcode    VARCHAR(5),
  sector     VARCHAR(8),

  -- LR codes: D detached, S semi, T terraced, F flat, O other
  property_type CHAR(1),
  new_build  BOOLEAN,
  tenure     CHAR(1),          -- F freehold, L leasehold

  paon       TEXT,             -- house number / name
  saon       TEXT,             -- flat / sub-building
  street     TEXT,
  locality   TEXT,
  town       TEXT,
  district_name TEXT,
  county     TEXT,

  ppd_category CHAR(1),        -- A standard price paid, B additional
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The three access patterns: comps by sector, comps by outcode, and dedupe.
CREATE INDEX IF NOT EXISTS idx_lr_sector_date  ON land_registry_sales(sector, sold_date DESC);
CREATE INDEX IF NOT EXISTS idx_lr_outcode_date ON land_registry_sales(outcode, sold_date DESC);
CREATE INDEX IF NOT EXISTS idx_lr_postcode     ON land_registry_sales(postcode);

-- ── Comp coverage ─────────────────────────────────────────────────────────
-- Records which sectors have been photo/detail-enriched and when, so the
-- on-demand path knows whether to scrape or serve what's already stored.
-- This is what makes step 2 of the strategy ("seconds the first time, instant
-- after") possible without re-scraping on every analysis.
CREATE TABLE IF NOT EXISTS comp_coverage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scope       VARCHAR(10) NOT NULL,   -- 'sector' | 'outcode'
  scope_value VARCHAR(12) NOT NULL,   -- 'M13 9'  | 'M13'
  source      VARCHAR(40) NOT NULL,   -- 'rightmove_sold'
  last_enriched_at TIMESTAMPTZ,
  comps_found INTEGER DEFAULT 0,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|ok|empty|failed
  last_error  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_coverage_unique
  ON comp_coverage(scope, scope_value, source);

-- ── Import checkpointing ──────────────────────────────────────────────────
-- A 29M-row import will not finish in one process. This lets it resume.
CREATE TABLE IF NOT EXISTS import_progress (
  job          VARCHAR(60) PRIMARY KEY,   -- 'land_registry_pp'
  cursor_value TEXT,                      -- last row / offset processed
  rows_done    BIGINT DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'idle',
  notes        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Comp selection over Land Registry ─────────────────────────────────────
-- Same shape as find_sold_comps so the engine can merge the two result sets.
-- Geo comes from the postcode centroid join. Bedrooms and floor area are NULL
-- by definition — LR does not publish them — and the valuation engine already
-- handles that (mild similarity penalty, no £/sqft).
CREATE OR REPLACE FUNCTION find_land_registry_comps(
  p_lat           double precision,
  p_lng           double precision,
  p_radius_m      integer DEFAULT 1600,
  p_property_type text    DEFAULT NULL,   -- LR code: D/S/T/F/O
  p_months        integer DEFAULT 24,
  p_limit         integer DEFAULT 40
)
RETURNS TABLE (
  sale_id           UUID,
  canonical_address TEXT,
  postcode          VARCHAR(10),
  distance_m        double precision,
  sold_price        NUMERIC,
  sold_date         DATE,
  property_type     CHAR(1),
  source            TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    NULLIF(TRIM(CONCAT_WS(' ', s.saon, s.paon, s.street)), '') AS canonical_address,
    s.postcode,
    ST_Distance(g.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m,
    s.price,
    s.sold_date,
    s.property_type,
    'land_registry'::text
  FROM land_registry_sales s
  JOIN postcode_geo g ON g.postcode = s.postcode
  WHERE g.geog IS NOT NULL
    AND ST_DWithin(g.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    AND s.sold_date >= (CURRENT_DATE - (p_months || ' months')::interval)
    AND (p_property_type IS NULL OR s.property_type = p_property_type)
    AND s.price > 0
    -- Category B covers repossessions, transfers under power of sale and other
    -- non-open-market deals; including them would drag comps below market.
    AND (s.ppd_category IS NULL OR s.ppd_category = 'A')
  ORDER BY distance_m ASC, s.sold_date DESC
  LIMIT p_limit;
$$;

-- ── Lockdown: pipeline tables are service-role only ───────────────────────
ALTER TABLE postcode_geo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_registry_sales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_coverage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_progress      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON postcode_geo, land_registry_sales, comp_coverage, import_progress
  FROM anon, authenticated;
GRANT ALL ON postcode_geo, land_registry_sales, comp_coverage, import_progress
  TO service_role;

REVOKE ALL ON FUNCTION find_land_registry_comps(double precision, double precision, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION find_land_registry_comps(double precision, double precision, integer, text, integer, integer)
  TO service_role;
