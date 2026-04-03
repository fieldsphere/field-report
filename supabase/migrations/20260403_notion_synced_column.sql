alter table public.feedback_items
  add column if not exists notion_synced boolean not null default false;

update public.feedback_items
  set notion_synced = true
  where notion_page_id is not null;

update public.feedback_items
  set notion_page_id = null
  where notion_page_id = 'existing-in-notion';

create index if not exists idx_feedback_items_notion_synced
  on public.feedback_items (notion_synced)
  where notion_synced = false;
