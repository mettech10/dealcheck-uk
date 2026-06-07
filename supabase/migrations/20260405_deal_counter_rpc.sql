-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add RPC-callable increment_deal_count function
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- This allows the frontend to increment the deal counter without authentication,
-- so every analysis (logged-in or not) is counted.
-- ──────────────────────────────────────────────────────────────────────────────

-- RPC function (callable from client, no auth needed)
create or replace function public.increment_deal_count_rpc()
  returns void
  language plpgsql
  security definer
as $$
begin
  update public.global_stats
    set deal_count = deal_count + 1,
        updated_at = now()
    where id = 1;
end;
$$;

-- Allow anon and authenticated roles to call the RPC
grant execute on function public.increment_deal_count_rpc() to anon;
grant execute on function public.increment_deal_count_rpc() to authenticated;

-- Also allow anon to update global_stats (needed for fallback path)
create policy "Anon can increment global stats"
  on public.global_stats
  for update
  using (true)
  with check (true);
