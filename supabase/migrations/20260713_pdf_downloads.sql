-- Deal Package PDF download tracking. Written by the generate-pdf route
-- via the service-role key; RLS enabled with no policies.
-- Applied to production 2026-07-13 via Supabase MCP (pdf_downloads).

CREATE TABLE IF NOT EXISTS pdf_downloads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  report_id VARCHAR(20),
  strategy VARCHAR(50),
  postcode VARCHAR(10),
  purchase_price DECIMAL(12,2),
  deal_score INTEGER,
  pdf_tier VARCHAR(20),
  file_size_kb INTEGER,
  pages INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_downloads_user ON pdf_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_downloads_date ON pdf_downloads(generated_at);

ALTER TABLE pdf_downloads ENABLE ROW LEVEL SECURITY;
