-- Cache for Bright Data scraper results (Rightmove listings + searches).
-- Written/read exclusively by server-side routes via the service-role key;
-- RLS is enabled with no policies so anon/authenticated clients have no access.
-- Applied to production 2026-07-06 via Supabase MCP (create_scraper_cache).

CREATE TABLE IF NOT EXISTS scraper_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key VARCHAR(100) NOT NULL UNIQUE,
  data JSONB NOT NULL,
  source VARCHAR(50) DEFAULT 'rightmove',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_cache_key ON scraper_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_scraper_cache_age ON scraper_cache(created_at);

ALTER TABLE scraper_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE scraper_cache IS
  'Bright Data scrape cache. Listing entries live 4h, search entries 1h (enforced on read). Entries older than 24h are safe to purge.';
