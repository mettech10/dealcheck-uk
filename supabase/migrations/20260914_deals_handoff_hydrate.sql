-- Shared deals spine for Screener → Analyser handoff hydrate.
--
-- Canonical CREATE is Flask metusa-deal-analyzer
-- supabase/migrations/20260914_deals_and_property_spine.sql (PR #92).
-- This copy is IF NOT EXISTS so it is safe whether Flask or Next applies
-- first. Next does NOT insert deals — Flask POST /v1/deals is the SoT.
-- GET /api/v1/deals/:id reads these rows under user RLS to hydrate
-- /analyse?dealId=.
--
-- properties already exists from Discovery (20260817). Authenticated
-- SELECT is granted only for rows linked to the caller's deals.

CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,

  source TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  strategy TEXT,
  rent_pcm_gbp NUMERIC(12,2),
  listing JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'created',

  idempotency_key TEXT,
  source_listing_id TEXT,
  listing_source TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deals_source_check CHECK (source IN ('screener')),
  CONSTRAINT deals_strategy_check CHECK (
    strategy IS NULL OR strategy IN ('btl', 'hmo', 'brrrr', 'flip', 'sa', 'development')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS deals_user_idempotency_idx
  ON public.deals (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_property_id_idx
  ON public.deals (property_id);

CREATE INDEX IF NOT EXISTS deals_user_created_idx
  ON public.deals (user_id, created_at DESC);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.deals TO authenticated;
GRANT SELECT ON public.properties TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deals'
      AND policyname = 'Users can view own deals'
  ) THEN
    CREATE POLICY "Users can view own deals"
      ON public.deals FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'properties'
      AND policyname = 'Users can view properties linked to own deals'
  ) THEN
    CREATE POLICY "Users can view properties linked to own deals"
      ON public.properties FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.deals
          WHERE deals.property_id = properties.id
            AND deals.user_id = auth.uid()
        )
      );
  END IF;
END $$;
