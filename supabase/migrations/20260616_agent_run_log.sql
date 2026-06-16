-- ─────────────────────────────────────────────────────────────────────────
-- 20260616 — agent_run_log (Self-Learning Agents, Section 1)
-- ─────────────────────────────────────────────────────────────────────────
-- Per-run audit log for the scheduled self-learning agents (BaseAgent.run()).
-- Service-role only: agents write and the admin dashboard reads via the
-- service-role key; anon/authenticated have no access. Applied 2026-06-16.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_run_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  duration_ms INTEGER,
  items_processed INTEGER DEFAULT 0,
  insights TEXT[] DEFAULT '{}',
  errors TEXT[] DEFAULT '{}',
  run_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_log_agent ON agent_run_log(agent, run_at DESC);

ALTER TABLE agent_run_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_run_log FROM anon, authenticated;
GRANT ALL ON agent_run_log TO service_role;
