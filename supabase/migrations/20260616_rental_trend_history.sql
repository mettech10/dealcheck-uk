-- ─────────────────────────────────────────────────────────────────────────
-- 20260616 — rental_trend_history (Self-Learning Agents, Section 4)
-- ─────────────────────────────────────────────────────────────────────────
-- Time-series of room/rental signals per postcode district, written monthly
-- by RentalTrendAgent. Lets the platform learn how HMO room rents move over
-- time (e.g. "rising_hmo_rents in M14") rather than only knowing today's snap.
--
-- Service-role only: the agent writes and the admin dashboard reads via the
-- service-role key; anon/authenticated have no access. The UNIQUE index makes
-- a re-run within the same month idempotent (upsert on the same data_date).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rental_trend_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  postcode_district VARCHAR(10) NOT NULL,
  data_date DATE NOT NULL,
  avg_room_rent NUMERIC,        -- mean per-room PCM (HMO rooms)
  avg_monthly_rent NUMERIC,     -- mean whole-property PCM (BTL), when available
  listing_count INTEGER DEFAULT 0,
  data_type VARCHAR(20) NOT NULL DEFAULT 'hmo_room', -- 'hmo_room' | 'btl'
  source VARCHAR(40),           -- e.g. 'spareroom-live', 'propertydata'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One reading per district/month/type — re-runs upsert instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_trend_unique
  ON rental_trend_history(postcode_district, data_date, data_type);

CREATE INDEX IF NOT EXISTS idx_rental_trend_lookup
  ON rental_trend_history(postcode_district, data_type, data_date DESC);

ALTER TABLE rental_trend_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rental_trend_history FROM anon, authenticated;
GRANT ALL ON rental_trend_history TO service_role;
