-- Portfolio Properties — full schema per /tools/portfolio spec.
-- The earlier 20260316_portfolio.sql file was never applied in
-- production; this migration is the canonical create.

CREATE TABLE IF NOT EXISTS portfolio_properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Property details
  nickname            VARCHAR(200),
  address             TEXT NOT NULL,
  postcode            VARCHAR(10),
  property_type       VARCHAR(50),
  bedrooms            INTEGER,
  strategy            VARCHAR(50),

  -- Financial snapshot
  purchase_price      DECIMAL(12,2) NOT NULL,
  purchase_date       DATE,
  current_value       DECIMAL(12,2) NOT NULL,
  outstanding_mortgage DECIMAL(12,2) DEFAULT 0,
  mortgage_rate       DECIMAL(5,2),
  mortgage_type       VARCHAR(20),   -- interest_only | repayment
  monthly_rent        DECIMAL(10,2) NOT NULL,
  monthly_mortgage    DECIMAL(10,2) DEFAULT 0,
  monthly_expenses    DECIMAL(10,2) DEFAULT 0,

  -- Computed snapshots
  gross_yield         DECIMAL(5,2),
  net_yield           DECIMAL(5,2),
  monthly_cashflow    DECIMAL(10,2),
  ltv                 DECIMAL(5,2),
  equity              DECIMAL(12,2),
  equity_gain         DECIMAL(12,2),
  equity_gain_percent DECIMAL(5,2),

  -- HMO specific
  number_of_rooms     INTEGER,
  rent_per_room       DECIMAL(8,2),

  -- Status + linkage
  status              VARCHAR(50) DEFAULT 'owned',
  notes               TEXT,
  analysis_id         UUID,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_user_id
  ON portfolio_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_status
  ON portfolio_properties(status);

ALTER TABLE portfolio_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own properties" ON portfolio_properties;
DROP POLICY IF EXISTS "Users can insert own properties" ON portfolio_properties;
DROP POLICY IF EXISTS "Users can update own properties" ON portfolio_properties;
DROP POLICY IF EXISTS "Users can delete own properties" ON portfolio_properties;

CREATE POLICY "Users can view own properties"
  ON portfolio_properties FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own properties"
  ON portfolio_properties FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own properties"
  ON portfolio_properties FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own properties"
  ON portfolio_properties FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION portfolio_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portfolio_touch ON portfolio_properties;
CREATE TRIGGER trg_portfolio_touch
  BEFORE UPDATE ON portfolio_properties
  FOR EACH ROW
  EXECUTE FUNCTION portfolio_touch_updated_at();
