-- ─────────────────────────────────────────────────────────────────────────
-- 20260614 — Metalyzi proprietary intelligence tables (Section 2)
-- ─────────────────────────────────────────────────────────────────────────
--
-- The accumulated-expertise layer that makes the platform smarter over time,
-- owned by Metusa Property Ltd and independent of whichever AI model is used.
-- Four tables: per-area aggregate intelligence, per-user investor profiles,
-- discovered deal patterns, and platform-wide benchmarks.
--
-- SECURITY: every table has RLS enabled. The intelligence pipeline, context
-- builder and admin dashboard all use the service-role key (which bypasses
-- RLS), so the tables are service-role-only by default. The single exception
-- is that authenticated users may read THEIR OWN investor profile. anon and
-- authenticated are explicitly revoked from all four tables.
--
-- Applied to the supabase-matalyzi project on 2026-06-14. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

-- ── area_intelligence — aggregate intelligence per postcode district ───────
CREATE TABLE IF NOT EXISTS area_intelligence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  postcode_district VARCHAR(10) NOT NULL UNIQUE,
  deal_count INTEGER DEFAULT 0,
  btl_deal_count INTEGER DEFAULT 0,
  hmo_deal_count INTEGER DEFAULT 0,
  brrrr_deal_count INTEGER DEFAULT 0,
  sa_deal_count INTEGER DEFAULT 0,
  flip_deal_count INTEGER DEFAULT 0,
  dev_deal_count INTEGER DEFAULT 0,
  median_btl_gross_yield DECIMAL(5,2),
  median_hmo_gross_yield DECIMAL(5,2),
  median_sa_monthly_revenue DECIMAL(10,2),
  median_btl_monthly_cashflow DECIMAL(8,2),
  median_hmo_monthly_cashflow DECIMAL(8,2),
  pct_deals_positive_cashflow DECIMAL(5,2),
  median_purchase_price DECIMAL(12,2),
  median_price_per_sqft DECIMAL(8,2),
  avg_void_weeks_entered DECIMAL(4,1),
  dominant_strategy VARCHAR(50),
  article4_active BOOLEAN,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  -- 'low' < 10 deals, 'medium' 10-50, 'high' > 50
  confidence_level VARCHAR(20) DEFAULT 'low'
);

-- ── user_investor_profiles — preferences learned from analysis history ─────
CREATE TABLE IF NOT EXISTS user_investor_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferred_strategies TEXT[] DEFAULT '{}',
  preferred_postcode_areas TEXT[] DEFAULT '{}',
  typical_budget_min DECIMAL(12,2),
  typical_budget_max DECIMAL(12,2),
  typical_deposit_pct DECIMAL(5,2),
  typical_mortgage_rate DECIMAL(5,2),
  -- 'conservative', 'moderate', 'aggressive'
  risk_appetite VARCHAR(20) DEFAULT 'moderate',
  total_analyses INTEGER DEFAULT 0,
  total_strategies_used TEXT[] DEFAULT '{}',
  most_active_area VARCHAR(10),
  avg_deal_score_analysed DECIMAL(5,2),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── deal_patterns — patterns discovered from analysis data ─────────────────
CREATE TABLE IF NOT EXISTS deal_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type VARCHAR(100),          -- e.g. 'high_yield_area', 'article4_risk'
  strategy VARCHAR(50),
  postcode_area VARCHAR(5),           -- e.g. 'BL', 'M', 'LS'
  description TEXT,
  trigger_conditions JSONB,           -- e.g. { "grossYield": { "gt": 9 } }
  insight TEXT,
  recommendation TEXT,
  frequency INTEGER DEFAULT 1,
  confidence DECIMAL(5,2) DEFAULT 0.5,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── platform_benchmarks — platform-wide rolling benchmarks ─────────────────
CREATE TABLE IF NOT EXISTS platform_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name VARCHAR(100) UNIQUE,
  metric_value DECIMAL(12,4),
  metric_type VARCHAR(50),            -- 'yield','cashflow','price','percentage','count'
  strategy VARCHAR(50),               -- null = all strategies
  sample_size INTEGER,
  last_calculated TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- postcode_district / user_id are UNIQUE (already indexed); only the composite
-- pattern lookup needs an explicit index.
CREATE INDEX IF NOT EXISTS idx_patterns_area ON deal_patterns(postcode_area, strategy, active);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE area_intelligence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_investor_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_patterns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_benchmarks     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own investor profile" ON user_investor_profiles;
CREATE POLICY "Users read own investor profile" ON user_investor_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Privileges — least privilege ───────────────────────────────────────────
REVOKE ALL ON area_intelligence, user_investor_profiles, deal_patterns, platform_benchmarks FROM anon, authenticated;
GRANT ALL ON area_intelligence, user_investor_profiles, deal_patterns, platform_benchmarks TO service_role;
GRANT SELECT ON user_investor_profiles TO authenticated;
