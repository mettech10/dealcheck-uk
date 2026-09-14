-- Ltd Co calculator: persist the latest personal-vs-ltd comparison on a deal.
-- Written by the calc API when a dealId the user owns is supplied.

ALTER TABLE public.saved_analyses
  ADD COLUMN IF NOT EXISTS ltd_co_compare jsonb,
  ADD COLUMN IF NOT EXISTS ltd_co_compare_at timestamptz;

COMMENT ON COLUMN public.saved_analyses.ltd_co_compare IS
  'Latest Personal vs Ltd Co comparison payload (lib/ltdCoCompare.ts). Educational illustration only.';
