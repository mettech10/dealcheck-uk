-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Discovery — layered ingestion pipeline
-- ═══════════════════════════════════════════════════════════════════════════
-- Before this migration the scraper normalised in memory and wrote straight
-- into discovery_results, which is scoped to a single search. That meant:
--   • no replay/debug when a score looked wrong (raw payload was discarded)
--   • the same property found by two searches became two unrelated rows
--   • no way to tell active from sold/delisted, or how long we'd seen it
--   • records missing mandatory fields were silently dropped
--
-- This adds the raw → normalized → canonical split:
--
--   L1  discovery_raw_listings  raw scraped payload, as-is, with source
--                               metadata. Never transformed. Replay source.
--   L2  discovery_quarantine    records that failed validation — captured,
--                               not silently dropped, not silently included.
--   L3  properties              ONE canonical row per real-world property,
--                               shared across every search and user.
--       property_listings       observations of that property over time
--                               (price changes, relisting, status).
--
-- discovery_results keeps its job (per-search screening + scoring output) and
-- now links back to the canonical property via property_id.
--
-- UK notes: there is no parcel ID, and UPRN needs an Ordnance Survey licence,
-- so the dedup key is a hash of the normalised address + postcode. Geo is
-- lat/lng from postcodes.io (free, no key) promoted to a PostGIS geography so
-- radius search is a real index scan rather than a table sweep.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── L1: raw landing zone ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_raw_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Groups every row produced by one scrape run, so a run can be replayed.
  run_id UUID NOT NULL,
  search_id UUID REFERENCES discovery_searches(id) ON DELETE SET NULL,

  -- Source metadata — on every record, per the architecture.
  source VARCHAR(50) NOT NULL,              -- e.g. 'rightmove_search'
  source_url TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Reliability of this source, 0..1. Search cards are partial (often only an
  -- outcode), so they score lower than a full listing page fetch.
  confidence NUMERIC(3,2) DEFAULT 0.70,

  -- The payload exactly as the scraper returned it. Never transformed.
  payload JSONB NOT NULL,

  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_run ON discovery_raw_listings(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_unprocessed
  ON discovery_raw_listings(processed, scraped_at DESC);

-- ── L2: quarantine ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_quarantine (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID,
  raw_id UUID REFERENCES discovery_raw_listings(id) ON DELETE CASCADE,
  source VARCHAR(50),
  source_url TEXT,
  payload JSONB,
  missing_fields TEXT[] DEFAULT '{}',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_run ON discovery_quarantine(run_id, created_at DESC);

-- ── L3: canonical property ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- sha256(normalised address | postcode) — the dedup identity.
  property_key TEXT NOT NULL UNIQUE,

  canonical_address TEXT NOT NULL,
  postcode VARCHAR(10),
  postcode_district VARCHAR(10),

  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  -- Generated so it can never drift from lat/lng. NULL until geocoded.
  geog GEOGRAPHY(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
      END
    ) STORED,

  property_type VARCHAR(50),
  bedrooms INTEGER,
  bathrooms INTEGER,
  tenure VARCHAR(30),

  -- Staleness tagging
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',   -- active|pending|sold|delisted

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geo-radius search by area (the layer-6 query path).
CREATE INDEX IF NOT EXISTS idx_properties_geog ON properties USING GIST (geog);
-- Fast area + price + type filtering.
CREATE INDEX IF NOT EXISTS idx_properties_district
  ON properties(postcode_district, status, bedrooms);

-- ── L3: listing observations over time ────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  raw_id UUID REFERENCES discovery_raw_listings(id) ON DELETE SET NULL,

  source VARCHAR(50) NOT NULL,
  source_url TEXT NOT NULL,
  listing_id VARCHAR(50),

  price NUMERIC(12,2),
  price_text TEXT,
  is_reduced BOOLEAN DEFAULT false,
  listed_at TEXT,

  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per property per source URL; re-scraping updates it (price history
-- is captured by last_seen + price changes rather than duplicate rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_listings_unique
  ON property_listings(property_id, source_url);
CREATE INDEX IF NOT EXISTS idx_property_listings_property
  ON property_listings(property_id, last_seen DESC);

-- ── Link the per-search results back to the canonical property ────────────
ALTER TABLE discovery_results
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_results_property
  ON discovery_results(property_id);

-- ── RLS: pipeline tables are service-role only ────────────────────────────
-- These hold cross-user scraped data; only server jobs touch them. User-facing
-- reads continue to go through discovery_results, which is already owner-scoped.
ALTER TABLE discovery_raw_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_listings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON discovery_raw_listings FROM anon, authenticated;
REVOKE ALL ON discovery_quarantine FROM anon, authenticated;
REVOKE ALL ON properties FROM anon, authenticated;
REVOKE ALL ON property_listings FROM anon, authenticated;

GRANT ALL ON discovery_raw_listings TO service_role;
GRANT ALL ON discovery_quarantine TO service_role;
GRANT ALL ON properties TO service_role;
GRANT ALL ON property_listings TO service_role;
