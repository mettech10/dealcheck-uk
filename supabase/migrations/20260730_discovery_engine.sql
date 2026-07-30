-- Deal Discovery Engine — saved searches + two-tier screening results.
--
-- Tier 1 (fast screen) runs on every listing found and stores its signals
-- even when the listing fails, so thresholds can be tuned from real data.
-- Tier 2 (deep analysis) only populates full_analysis/strategy_scores for
-- listings that passed, and is capped per run to control cost.

CREATE TABLE IF NOT EXISTS discovery_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Search criteria
  search_name VARCHAR(200),
  postcode_areas TEXT[],
  strategies TEXT[],
  min_price DECIMAL(12,2),
  max_price DECIMAL(12,2),
  min_bedrooms INTEGER,
  max_bedrooms INTEGER,

  -- Automation
  is_recurring BOOLEAN DEFAULT false,
  frequency VARCHAR(20),
  last_run_at TIMESTAMP WITH TIME ZONE,

  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discovery_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID REFERENCES discovery_searches(id) ON DELETE CASCADE,

  -- Listing reference
  listing_url TEXT NOT NULL,
  listing_id VARCHAR(50),
  address TEXT,
  postcode VARCHAR(10),
  price DECIMAL(12,2),
  bedrooms INTEGER,
  property_type VARCHAR(50),
  thumbnail_url TEXT,

  -- Tier 1 fast screen
  tier1_signals JSONB,
  tier1_score INTEGER,
  passed_tier1 BOOLEAN DEFAULT false,

  -- Tier 2 deep analysis (only when passed_tier1)
  full_analysis JSONB,
  strategy_scores JSONB,
  best_strategy VARCHAR(50),
  best_score INTEGER,

  -- Status: 'screened' | 'analysed' | 'dismissed' | 'saved'
  status VARCHAR(20) DEFAULT 'screened',
  dismissed_by_user BOOLEAN DEFAULT false,

  found_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_search
  ON discovery_results(search_id, passed_tier1, best_score DESC);

-- Dedup: re-running a search updates the existing row for a listing rather
-- than piling up duplicates (the orchestrator upserts on this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_dedup
  ON discovery_results(search_id, listing_url);

CREATE INDEX IF NOT EXISTS idx_discovery_searches_user
  ON discovery_searches(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_searches_recurring
  ON discovery_searches(is_recurring, status, last_run_at);

-- Monthly discovery-search usage counter (Pro gating).
ALTER TABLE user_usage
  ADD COLUMN IF NOT EXISTS discovery_searches_used INTEGER DEFAULT 0;

-- RLS: users only ever see their own searches, and results only through
-- the parent search they own. Server jobs use the service-role key.
ALTER TABLE discovery_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_searches_own ON discovery_searches;
CREATE POLICY discovery_searches_own ON discovery_searches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS discovery_results_own ON discovery_results;
CREATE POLICY discovery_results_own ON discovery_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM discovery_searches s
      WHERE s.id = discovery_results.search_id AND s.user_id = auth.uid()
    )
  );
