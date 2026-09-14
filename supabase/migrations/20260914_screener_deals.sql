/**
 * Screener deals — user-initiated listing handoff from the Deal Screener
 * Chrome extension. Photos are never stored. Idempotent on
 * (user_id, idempotency_key) where the key is screener:{source}:{sourceListingId}.
 */

create table if not exists public.screener_deals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  idempotency_key   text not null,
  source            text not null default 'screener',
  schema_version    integer not null default 1,
  strategy_hint     text not null,
  listing           jsonb not null,

  unique (user_id, idempotency_key)
);

create index if not exists screener_deals_user_id_created_at_idx
  on public.screener_deals (user_id, created_at desc);

alter table public.screener_deals enable row level security;

create policy "Users can view own screener deals"
  on public.screener_deals
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own screener deals"
  on public.screener_deals
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own screener deals"
  on public.screener_deals
  for update
  using (auth.uid() = user_id);
