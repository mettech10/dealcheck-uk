-- Referral codes for the Share This Deal feature.
-- Codes live on user_subscriptions (generated lazily by /api/user/referral);
-- sign-ups attributed to a code land in referrals. Service-role access only.
-- Applied to production 2026-07-10 via Supabase MCP (referral_codes).

ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code VARCHAR(20) NOT NULL,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending | converted | rewarded
  reward_given BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE referrals IS
  'Sign-ups attributed to a referral code. referred_user_id unique — one referral per new account. Rewards are granted manually/asynchronously (status → rewarded).';
