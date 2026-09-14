-- DO NOT USE as a Deal Screener create path.
--
-- An early draft of dealcheck-uk PR #99 created public.screener_deals and
-- had Next POST /api/v1/deals insert into it. That is retired.
--
-- Canonical create is Flask POST /v1/deals (metusa-deal-analyzer PR #92)
-- into public.deals + public.properties
-- (Flask migration 20260914_deals_and_property_spine.sql).
--
-- Next.js may SELECT public.deals under user RLS to hydrate
-- /analyse?dealId=. Next.js must NOT INSERT screener_deals or deals.
-- Open in Metalyzi must not write this table.

DROP TABLE IF EXISTS public.screener_deals;
