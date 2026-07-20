-- Masterclass funnel (Section 2) — lead capture + nurture tracking.
--
-- One row per email (unique index backs the capture API's upsert
-- onConflict: 'email'). RLS enabled with NO policies: like
-- scraper_cache, only the service-role key (capture API, NurtureAgent,
-- auth callback, admin dashboard) can touch it — leads must never be
-- readable from the browser.

CREATE TABLE IF NOT EXISTS masterclass_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  investor_type VARCHAR(50),
  -- 'new', 'active', 'experienced', 'sourcer', 'agent', 'researching'
  main_strategy VARCHAR(50),
  -- 'BTL', 'HMO', 'BRRRR', 'Flip', 'SA', 'Development', 'not_sure'

  -- Tracking
  source VARCHAR(100) DEFAULT 'masterclass_landing',
  utm_source VARCHAR(100),
  utm_campaign VARCHAR(100),
  utm_medium VARCHAR(100),
  referrer TEXT,

  -- Conversion tracking
  pdf_downloaded BOOLEAN DEFAULT false,
  signed_up BOOLEAN DEFAULT false, -- became a Metalyzi user
  signed_up_at TIMESTAMP WITH TIME ZONE,
  converted_to_paid BOOLEAN DEFAULT false,

  -- Email sequence tracking
  nurture_stage INTEGER DEFAULT 0,
  last_email_sent TIMESTAMP WITH TIME ZONE,
  unsubscribed BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email
  ON masterclass_leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_nurture
  ON masterclass_leads(nurture_stage, unsubscribed);

ALTER TABLE masterclass_leads ENABLE ROW LEVEL SECURITY;
