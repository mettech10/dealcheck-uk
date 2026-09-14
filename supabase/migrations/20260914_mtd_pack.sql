-- MTD Pack v1 — UK property business working papers.
-- One property business per user; ledger rows are keyed by property_id
-- (portfolio_properties.id is the source of truth). No HMRC submission.

CREATE TABLE IF NOT EXISTS mtd_property_businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL DEFAULT 'UK property business',
  accounting_basis VARCHAR(20) NOT NULL DEFAULT 'cash'
    CHECK (accounting_basis IN ('cash', 'accruals')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS mtd_ledger_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES mtd_property_businesses(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES portfolio_properties(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_id VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  reference VARCHAR(120),
  source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'csv')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtd_ledger_user_date
  ON mtd_ledger_entries (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_mtd_ledger_property
  ON mtd_ledger_entries (property_id);
CREATE INDEX IF NOT EXISTS idx_mtd_ledger_business
  ON mtd_ledger_entries (business_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS mtd_share_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES mtd_property_businesses(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label VARCHAR(200),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtd_share_user
  ON mtd_share_links (user_id, created_at DESC);

ALTER TABLE mtd_property_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtd_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtd_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mtd business" ON mtd_property_businesses;
DROP POLICY IF EXISTS "Users can insert own mtd business" ON mtd_property_businesses;
DROP POLICY IF EXISTS "Users can update own mtd business" ON mtd_property_businesses;

CREATE POLICY "Users can view own mtd business"
  ON mtd_property_businesses FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mtd business"
  ON mtd_property_businesses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mtd business"
  ON mtd_property_businesses FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own mtd ledger" ON mtd_ledger_entries;
DROP POLICY IF EXISTS "Users can insert own mtd ledger" ON mtd_ledger_entries;
DROP POLICY IF EXISTS "Users can update own mtd ledger" ON mtd_ledger_entries;
DROP POLICY IF EXISTS "Users can delete own mtd ledger" ON mtd_ledger_entries;

CREATE POLICY "Users can view own mtd ledger"
  ON mtd_ledger_entries FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mtd ledger"
  ON mtd_ledger_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mtd ledger"
  ON mtd_ledger_entries FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mtd ledger"
  ON mtd_ledger_entries FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own mtd shares" ON mtd_share_links;
DROP POLICY IF EXISTS "Users can insert own mtd shares" ON mtd_share_links;
DROP POLICY IF EXISTS "Users can update own mtd shares" ON mtd_share_links;
DROP POLICY IF EXISTS "Users can delete own mtd shares" ON mtd_share_links;

CREATE POLICY "Users can view own mtd shares"
  ON mtd_share_links FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mtd shares"
  ON mtd_share_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mtd shares"
  ON mtd_share_links FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mtd shares"
  ON mtd_share_links FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION mtd_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mtd_business_touch ON mtd_property_businesses;
CREATE TRIGGER trg_mtd_business_touch
  BEFORE UPDATE ON mtd_property_businesses
  FOR EACH ROW
  EXECUTE FUNCTION mtd_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mtd_ledger_touch ON mtd_ledger_entries;
CREATE TRIGGER trg_mtd_ledger_touch
  BEFORE UPDATE ON mtd_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION mtd_touch_updated_at();
