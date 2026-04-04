alter table public.feedback_items
drop constraint if exists feedback_items_dedupe_key_key;

create unique index if not exists idx_feedback_items_run_dedupe
on public.feedback_items(run_id, dedupe_key);

create table if not exists public.feedback_run_summaries (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique references public.feedback_runs(run_id) on delete cascade,
  generated_at timestamptz not null,
  total_items integer not null default 0,
  top_n integer not null default 5,
  intro text not null,
  themes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_run_summaries_run_id
on public.feedback_run_summaries(run_id);

drop trigger if exists trg_feedback_run_summaries_updated_at on public.feedback_run_summaries;
create trigger trg_feedback_run_summaries_updated_at
before update on public.feedback_run_summaries
for each row execute function public.set_updated_at();
