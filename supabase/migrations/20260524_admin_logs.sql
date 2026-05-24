-- ─────────────────────────────────────────────────────────────────────────
-- 20260524 — admin_error_log + admin_activity_log
-- ─────────────────────────────────────────────────────────────────────────
--
-- Two append-only tables that feed the admin dashboard's Errors and
-- Activity pages. Both are service-role only — non-admin users never
-- read or write these directly; the writers are the Flask backend
-- (errors), the Next.js API routes (errors + activity), and the
-- /api/admin/log-error endpoint for client-side exceptions.
--
-- Why two tables not one: errors carry stack traces + resolution
-- state, activity carries metadata + IP. Different shapes, different
-- access patterns (errors are filtered by resolved flag often;
-- activity is mostly tail-N queries). Keeping them split keeps
-- indexes lean.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── admin_error_log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_type TEXT,
    -- 'api_error' | 'scraper_error' | 'payment_error' | 'auth_error' |
    -- 'frontend_error' | 'flask_5xx' | 'unknown'
  message TEXT,
  stack TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_error_log_created_idx
  ON admin_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_error_log_unresolved_idx
  ON admin_error_log (created_at DESC)
  WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS admin_error_log_type_idx
  ON admin_error_log (error_type, created_at DESC);

ALTER TABLE admin_error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_error_log service all" ON admin_error_log;
CREATE POLICY "admin_error_log service all"
  ON admin_error_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No `authenticated` policy — admin pages read via service-role
-- through the admin client; ordinary users have no business
-- touching this table.


-- ─── admin_activity_log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
    -- 'signup' | 'analysis' | 'payment' | 'login' | 'pdf_export' | 'saved_deal'
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- strategy / postcode / amount / address etc. — schemaless to
    -- keep instrumentation cheap. Admin UI renders shape-aware
    -- summaries per event_type.
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS admin_activity_log_created_idx
  ON admin_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_type_idx
  ON admin_activity_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_user_idx
  ON admin_activity_log (user_id, created_at DESC);

ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_activity_log service all" ON admin_activity_log;
CREATE POLICY "admin_activity_log service all"
  ON admin_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
