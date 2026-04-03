create extension if not exists pgcrypto;

create table if not exists public.feedback_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  generated_at timestamptz not null,
  model_used text,
  from_datetime timestamptz,
  to_datetime timestamptz,
  calls_processed integer not null default 0,
  total_feedback_items integer not null default 0,
  status text not null check (status in ('preparing', 'extracting', 'merging', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_calls (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.feedback_runs(run_id) on delete cascade,
  call_id text not null,
  title text,
  started timestamptz,
  duration integer,
  gong_url text,
  call_payload jsonb,
  shard_status text not null check (shard_status in ('pending', 'complete', 'failed')),
  shard_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, call_id)
);

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.feedback_runs(run_id) on delete cascade,
  call_id text not null,
  -- Globally unique: callId + hash(normalizedQuote). If the same quote appears
  -- in a later run, the upsert overwrites run_id/call_id/metadata on the
  -- existing row. Per-run item counts may therefore differ from the row count
  -- scoped to that run_id.
  dedupe_key text not null unique,
  summary text not null,
  feedback_type text not null,
  severity text,
  verbatim_quote text,
  evidence_speaker text,
  evidence_timestamp text,
  confidence text,
  call_title text,
  call_date timestamptz,
  gong_url text,
  field_engineer text,
  customer_account text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_runs_status on public.feedback_runs(status);
create index if not exists idx_feedback_calls_run_id on public.feedback_calls(run_id);
create index if not exists idx_feedback_items_run_id on public.feedback_items(run_id);
create index if not exists idx_feedback_items_notion_page_id on public.feedback_items(notion_page_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feedback_runs_updated_at on public.feedback_runs;
create trigger trg_feedback_runs_updated_at
before update on public.feedback_runs
for each row execute function public.set_updated_at();

drop trigger if exists trg_feedback_calls_updated_at on public.feedback_calls;
create trigger trg_feedback_calls_updated_at
before update on public.feedback_calls
for each row execute function public.set_updated_at();

drop trigger if exists trg_feedback_items_updated_at on public.feedback_items;
create trigger trg_feedback_items_updated_at
before update on public.feedback_items
for each row execute function public.set_updated_at();
