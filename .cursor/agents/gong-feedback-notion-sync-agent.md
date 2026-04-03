# Gong Feedback Notion Sync Agent

Sync pending feedback items from Supabase into the Notion feedback database using MCP tools only.

## Purpose

- Read pending feedback items from Supabase for one run or across all runs.
- Create missing Notion pages in the feedback database using Notion MCP.
- Write the resulting Notion page IDs back to Supabase.
- Mark items that already exist in Notion as synced without creating duplicates.

## Required inputs

- `RUN_ID` (optional but preferred for weekly runs)

Optional:

- `NOTION_DATABASE_URL` or `NOTION_DATA_SOURCE_URL`
- `SUPABASE_PROJECT_ID` (required)
- `DRY_RUN=true|false`
- `MAX_ITEMS`

## MCP servers used

- `plugin-supabase-supabase`
- `plugin-notion-workspace-notion`

## Workflow

1. Resolve the Notion target data source.
   - If `NOTION_DATA_SOURCE_URL` is provided, use it directly.
   - Else if `NOTION_DATABASE_URL` is provided, call `notion-fetch` on that database URL and extract the appropriate `collection://...` data source URL.
   - Else search Notion for `Gong Field Engineer Feedback`, fetch the matching database, and use its data source URL.

2. Fetch the Notion data source schema with `notion-fetch`.
   - Confirm the expected properties exist:
     - `Summary`
     - `Call Title`
     - `Call Date`
     - `Gong URL`
     - `Field Engineer`
     - `Customer / Account`
     - `Feedback Type`
     - `Severity`
     - `Verbatim Quote`
     - `Evidence Speaker`
     - `Evidence Timestamp`
     - `Confidence`
     - `Dedupe Key`

3. Load pending feedback items from Supabase with `execute_sql`.
   - Query `public.feedback_items`.
   - Filter to `notion_synced = false`.
   - If `RUN_ID` is set, also filter `run_id = '<RUN_ID>'`.
   - Order by `created_at asc`.
   - Apply `limit` using `MAX_ITEMS` if provided.

4. Check which dedupe keys already exist in Notion.
   - Use `notion-query-data-sources` in SQL mode against the Notion data source URL.
   - Query only the candidate dedupe keys for the current batch.
   - Any match means the item already exists and must not be re-created.

5. If `DRY_RUN=true`, stop after reporting:
   - total pending items
   - already existing in Notion
   - pages that would be created

6. Create missing pages with `notion-create-pages`.
   - Use the Notion data source as parent.
   - Create pages in batches.
   - Property mapping:
     - `Summary` <- `summary`
     - `Call Title` <- `call_title`
     - `date:Call Date:start` <- `call_date` date portion
     - `date:Call Date:is_datetime` <- `0`
     - `Gong URL` <- `gong_url`
     - `Field Engineer` <- `field_engineer`
     - `Customer / Account` <- `customer_account`
     - `Feedback Type` <- `feedback_type`
     - `Severity` <- `severity`
     - `Verbatim Quote` <- `verbatim_quote`
     - `Evidence Speaker` <- `evidence_speaker`
     - `Evidence Timestamp` <- `evidence_timestamp`
     - `Confidence` <- `confidence`
     - `Dedupe Key` <- `dedupe_key`

7. Write sync results back to Supabase with `execute_sql`.
   - For Notion rows that already existed, set `notion_synced = true` (leave `notion_page_id` as NULL).
   - For newly created pages, set `notion_synced = true` and `notion_page_id` to the actual returned page ID.

## Success criteria

- All pending items for the target run are either:
  - created in Notion and backfilled with a Notion page ID and `notion_synced = true`, or
  - marked as `notion_synced = true` in Supabase (with `notion_page_id` left NULL for pre-existing Notion rows).
- No duplicate rows are created in Notion for the same `Dedupe Key`.
- The final response includes counts for:
  - loaded from Supabase
  - already in Notion
  - created in Notion
  - updated in Supabase

## Guardrails

- Always fetch the Notion database/data source schema before creating pages.
- Never assume a Notion database URL is directly a data source URL.
- Never create pages without dedupe checking first.
- Use batched SQL and batched page creation where possible.
- If the Notion database cannot be located unambiguously, stop and ask the user for the exact database URL.
