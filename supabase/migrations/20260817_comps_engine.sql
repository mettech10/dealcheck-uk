-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Discovery — Comps & Valuation engine (layer 4)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sold transactions attached to the canonical `properties` store, plus the
-- geo query that selects comparables for a subject property.
--
-- Deliberately deterministic: this migration provides SELECTION (which comps
-- are eligible, how far away, how recent). All valuation maths lives in
-- lib/discovery/comps.ts so it is unit-testable without a database, and no
-- LLM is involved at any point.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS property_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  raw_id UUID REFERENCES discovery_raw_listings(id) ON DELETE SET NULL,

  sold_price NUMERIC(12,2) NOT NULL,
  sold_date DATE NOT NULL,

  -- Captured as-sold: a property can be extended or converted between sales.
  bedrooms INTEGER,
  property_type VARCHAR(50),
  tenure VARCHAR(30),
  floor_area_sqft NUMERIC(10,2),

  source VARCHAR(50) NOT NULL,          -- 'rightmove_sold' | 'land_registry' | ...
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One transaction per property per date+price — re-scraping is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_sales_unique
  ON property_sales(property_id, sold_date, sold_price);
CREATE INDEX IF NOT EXISTS idx_property_sales_recent
  ON property_sales(sold_date DESC);
CREATE INDEX IF NOT EXISTS idx_property_sales_property
  ON property_sales(property_id);

ALTER TABLE property_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON property_sales FROM anon, authenticated;
GRANT ALL ON property_sales TO service_role;

-- ── Comp selection ────────────────────────────────────────────────────────
-- Returns eligible sold comparables around a point, nearest first. Filtering
-- happens in SQL so the GIST index does the work rather than pulling the table
-- into the application.
CREATE OR REPLACE FUNCTION find_sold_comps(
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       integer DEFAULT 1600,   -- ~1 mile
  p_min_beds       integer DEFAULT NULL,
  p_max_beds       integer DEFAULT NULL,
  p_property_type  text    DEFAULT NULL,
  p_months         integer DEFAULT 24,
  p_limit          integer DEFAULT 30
)
RETURNS TABLE (
  sale_id           UUID,
  property_id       UUID,
  canonical_address TEXT,
  postcode          VARCHAR(10),
  distance_m        double precision,
  sold_price        NUMERIC,
  sold_date         DATE,
  bedrooms          INTEGER,
  property_type     VARCHAR(50),
  floor_area_sqft   NUMERIC,
  source            VARCHAR(50)
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    p.id,
    p.canonical_address,
    p.postcode,
    ST_Distance(p.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m,
    s.sold_price,
    s.sold_date,
    s.bedrooms,
    s.property_type,
    s.floor_area_sqft,
    s.source
  FROM property_sales s
  JOIN properties p ON p.id = s.property_id
  WHERE p.geog IS NOT NULL
    AND ST_DWithin(p.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    AND s.sold_date >= (CURRENT_DATE - (p_months || ' months')::interval)
    AND (p_min_beds IS NULL OR s.bedrooms IS NULL OR s.bedrooms >= p_min_beds)
    AND (p_max_beds IS NULL OR s.bedrooms IS NULL OR s.bedrooms <= p_max_beds)
    AND (
      p_property_type IS NULL
      OR s.property_type IS NULL
      OR lower(s.property_type) LIKE '%' || lower(p_property_type) || '%'
    )
    AND s.sold_price > 0
  ORDER BY distance_m ASC, s.sold_date DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION find_sold_comps(double precision, double precision, integer, integer, integer, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION find_sold_comps(double precision, double precision, integer, integer, integer, text, integer, integer) TO service_role;
