-- Initial schema for the trading journal.
-- Run via `supabase db push`, or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- One row per auth.users user, created automatically on signup (see trigger
-- below). Holds app-specific profile data Supabase Auth doesn't store.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  starting_balance numeric
);

alter table profiles enable row level security;

create policy "profiles are self-only"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Audit trail for CSV imports, so a batch of imported trades can be traced
-- (and undone) as a unit. Created before `trades` since trades references it.
create table csv_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null,
  filename text not null,
  imported_at timestamptz not null default now(),
  row_count integer not null,
  status text not null default 'completed' check (status in ('completed', 'undone'))
);

alter table csv_imports enable row level security;

create policy "csv_imports are owner-only"
  on csv_imports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Execution. entry_price is nullable: a CSV import can land a trade whose
  -- opening fill(s) predate the export window (see
  -- lib/importers/colmex/group.ts) - entry_known=false flags that case (the
  -- exit/pnl are still the broker's real reported figures). entry_time is
  -- always set (falls back to exit_time for such trades, for ordering) even
  -- when entry_known is false, so it stays not-null.
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  quantity numeric not null check (quantity > 0),
  entry_price numeric,
  entry_time timestamptz not null,
  entry_known boolean not null default true,
  exit_price numeric,
  exit_time timestamptz,
  fees numeric not null default 0,
  pnl numeric, -- realized P&L; null while status = 'open'
  status text not null default 'closed' check (status in ('open', 'closed')),

  -- Risk planning (optional - CSV import can't know intent; filled in
  -- manually, either at entry or when the user reviews an imported trade).
  planned_stop numeric,
  planned_target numeric,

  -- Learning / context
  strategy_tag text,
  mistake_tags text[] not null default '{}',
  followed_plan boolean,
  notes text,
  thesis text,
  screenshot_url text,

  -- Provenance
  source text not null default 'manual' check (source in ('manual', 'colmex_csv')),
  import_batch_id uuid references csv_imports (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint exit_requires_price_and_time
    check (status = 'open' or (exit_price is not null and exit_time is not null))
);

create index trades_user_id_idx on trades (user_id);
create index trades_user_symbol_idx on trades (user_id, symbol);
create index trades_user_status_idx on trades (user_id, status);

alter table trades enable row level security;

create policy "trades are owner-only"
  on trades for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
