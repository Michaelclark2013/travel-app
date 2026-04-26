-- Per-trip preferences (airline, hotel, dietary, budget, etc).

alter table public.trips
  add column if not exists preferences jsonb not null default '{}'::jsonb;
