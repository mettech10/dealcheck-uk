-- ============================================================
-- PropertyData API Cache
-- Stores API responses to reduce API calls and enable
-- historical market data analysis.
-- ============================================================

CREATE TABLE IF NOT EXISTS propertydata_cache (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  postcode      TEXT NOT NULL,            -- normalised uppercase, e.g. "M1 1AA"
  endpoint      TEXT NOT NULL,            -- "sold-prices", "rents", "rents-hmo", "prices", etc.
  bedrooms      SMALLINT,                 -- NULL = any / not applicable
  params_hash   TEXT NOT NULL,            -- SHA-256 of sorted query params (dedup key)
  response      JSONB NOT NULL,           -- full API response body
  -- Extracted key figures for quick queries
  avg_price     NUMERIC,                  -- average sold/asking price
  avg_rent      NUMERIC,                  -- average monthly rent
  radius_km     NUMERIC,                  -- search radius used
  points_count  SMALLINT,                 -- points_analysed
  -- Timestamps
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one cached response per param combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_pd_cache_lookup
  ON propertydata_cache (params_hash);

-- Fast lookups by postcode + endpoint
CREATE INDEX IF NOT EXISTS idx_pd_cache_postcode_endpoint
  ON propertydata_cache (postcode, endpoint);

-- Time-based cleanup
CREATE INDEX IF NOT EXISTS idx_pd_cache_fetched
  ON propertydata_cache (fetched_at);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE propertydata_cache ENABLE ROW LEVEL SECURITY;

-- Cache is read/write by service role only (API routes use admin client).
-- Anon users can read cached stats via the market-data endpoint.
CREATE POLICY "Service role full access"
  ON propertydata_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow anon SELECT for the stats endpoint
CREATE POLICY "Anon read access"
  ON propertydata_cache
  FOR SELECT
  TO anon
  USING (true);

-- ── Cleanup function ─────────────────────────────────────────────
-- Delete cache entries older than 7 days (run via cron or manual)
CREATE OR REPLACE FUNCTION cleanup_propertydata_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM propertydata_cache
  WHERE fetched_at < NOW() - INTERVAL '7 days';
END;
$$;
