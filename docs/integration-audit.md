# Integration Audit Report

**Date:** 2026-04-03  
**Scope:** Notion writes, Supabase persistence, Slack integration status

---

## Baseline: README vs. Implemented Flow

`README.md` describes four steps. `docs/architecture.md` describes the actual implemented pipeline. These do not fully agree:

| README claim | Implemented? | Notes |
|---|---|---|
| Scrapes Field Eng Calls from Gong | Yes | `scripts/select-calls.mjs` via Gong `/v2/calls/extensive` |
| Extracts Feedback via AI | Yes | `scripts/extract-feedback-call.mjs` via AI Gateway |
| Stores in Notion | Yes | MCP sync via `scripts/push-to-notion.mjs` + agent |
| Slacks Top Feedback to `#field-report` | **No** | Zero Slack code in repo; README claim only |

`README.md` also makes no mention of Supabase, which is the primary persistence layer for all run data and the source the Notion sync reads from.

---

## 1. Notion Integration

### How it works

The Notion write path is fully MCP-driven. There is no direct `@notionhq/client` usage in the sync flow.

```
scripts/push-to-notion.mjs
  └─ spawnSync("cursor-agent", ["--approve-mcps", ...prompt])
       └─ .cursor/agents/gong-feedback-notion-sync-agent.md
            ├─ plugin-supabase-supabase  (execute_sql)
            └─ plugin-notion-workspace-notion  (notion-fetch, notion-query-data-sources, notion-create-pages)
```

### Verification method

Run preflight with dry-run before any live sync:

```bash
DRY_RUN=true RUN_ID=<run-id> node scripts/push-to-notion.mjs
```

This invokes the agent which:
1. Resolves the Notion database.
2. Validates the schema against the 13 required properties.
3. Queries Supabase for pending rows (`notion_page_id IS NULL`).
4. Checks existing Notion dedupe keys.
5. Reports counts (pending, already in Notion, would create) without writing anything.

Expect output: `loaded from Supabase`, `already in Notion`, `pages that would be created` counts.

### Checks and outcomes

| Check | Result |
|---|---|
| Launcher (`push-to-notion.mjs`) delegates entirely to MCP agent | **Pass** — no hidden write path; a single `spawnSync` of `cursor-agent` |
| Database resolution has safe fallback | **Pass** — resolves via `NOTION_DATA_SOURCE_URL` → `NOTION_DATABASE_URL` → search by name |
| Schema validated before page creation | **Pass** — agent fetches schema and verifies all 13 properties |
| Dedupe by `Dedupe Key` before insert | **Pass** — `notion-query-data-sources` called on candidate keys before `notion-create-pages` |
| `notion_page_id` backfilled in Supabase | **Pass** — real page ID for new pages; `existing-in-notion` sentinel for matches |
| Dry-run mode is safe and testable | **Pass** — `DRY_RUN=true` stops the agent before any write |

### Required env and dependencies

| Var | Required? | Default | Notes |
|---|---|---|---|
| `RUN_ID` | Optional | all pending | Filter to a specific run; strongly recommended |
| `SUPABASE_PROJECT_ID` | Optional | `ivbdhcmphazjqajprept` | **Risk:** hardcoded default could target wrong project |
| `NOTION_DATABASE_URL` | Optional | (search by name) | Provide to avoid ambiguous DB lookup |
| `NOTION_DATA_SOURCE_URL` | Optional | (derived) | Fastest path; skip resolution steps entirely |
| `DRY_RUN` | Optional | `false` | Set `true` for safe preflight |
| `MAX_ITEMS` | Optional | `1000` | Batch cap |
| `cursor-agent` CLI | **Required** | — | Must be installed and on `$PATH` |
| `plugin-notion-workspace-notion` MCP | **Required** | — | Must be authenticated in Cursor |
| `plugin-supabase-supabase` MCP | **Required** | — | Must be authenticated and pointed at correct project |

### Risks

**Blocking:**
- If `cursor-agent` is not installed or either MCP is not authenticated, the sync fails at spawn time with no retry or fallback. There is no way to verify MCP authentication status before running.
- The `existing-in-notion` sentinel stored in `notion_page_id` is not a real page ID. If any downstream query filters `notion_page_id IS NOT NULL`, it will include sentinel rows alongside real ones, making counts unreliable.

**Non-blocking:**
- The fallback database search (by name `"Gong Field Engineer Feedback"`) can match the wrong database if similarly-named databases exist in the workspace. Providing `NOTION_DATABASE_URL` eliminates this risk.
- The hardcoded default `SUPABASE_PROJECT_ID` in `push-to-notion.mjs` line 19 should be extracted to env for environments that differ from the default project.

---

## 2. Supabase Integration

### How it works

Supabase is the primary write store for all pipeline stages. The JS client (`@supabase/supabase-js`) is wrapped in `scripts/lib/supabase.mjs` and used by three scripts.

```
prepare-feedback-run.mjs   → upsertFeedbackRun, upsertFeedbackCalls
extract-feedback-call.mjs  → updateFeedbackRun, upsertFeedbackItems, updateFeedbackCall
merge-feedback-shards.mjs  → updateFeedbackRun (status, aggregates)
```

Notion sync writes back `notion_page_id` via Supabase MCP (`execute_sql`), not via the JS client.

### Verification method

```bash
# Check credentials resolve without error
WRITE_SUPABASE=true node -e "
  import('./scripts/lib/supabase.mjs').then(m => {
    const c = m.createSupabaseServiceClient();
    console.log('client created');
  }).catch(e => console.error(e.message));
"

# Confirm feedback_runs table is reachable (requires credentials)
# Use the Supabase dashboard or psql to check:
SELECT COUNT(*) FROM public.feedback_runs;
SELECT COUNT(*) FROM public.feedback_calls;
SELECT COUNT(*) FROM public.feedback_items;
```

### Schema alignment: migration vs. script usage

All columns written by the scripts are present in the migration `20260402_feedback_pipeline.sql`:

| Column | Table | Script that writes it | In migration? |
|---|---|---|---|
| `run_id`, `generated_at`, `from_datetime`, `to_datetime`, `calls_processed`, `total_feedback_items`, `status` | `feedback_runs` | `prepare-feedback-run.mjs`, `merge-feedback-shards.mjs` | Yes |
| `run_id`, `call_id`, `title`, `started`, `duration`, `gong_url`, `call_payload`, `shard_status` | `feedback_calls` | `prepare-feedback-run.mjs`, `extract-feedback-call.mjs` | Yes |
| `run_id`, `call_id`, `dedupe_key`, `summary`, `feedback_type`, `severity`, `verbatim_quote`, `evidence_speaker`, `evidence_timestamp`, `confidence`, `call_title`, `call_date`, `gong_url`, `field_engineer`, `customer_account` | `feedback_items` | `extract-feedback-call.mjs` | Yes |
| `notion_page_id` | `feedback_items` | Notion sync agent (via MCP SQL) | Yes |

**All fields present. Schema is aligned.**

### Idempotency checks

| Table | Upsert key | Safe to re-run? |
|---|---|---|
| `feedback_runs` | `run_id` | Yes |
| `feedback_calls` | `(run_id, call_id)` | Yes |
| `feedback_items` | `dedupe_key` (globally unique) | Conditionally — see risk below |

### Required env

| Var | Required? | Default | Notes |
|---|---|---|---|
| `SUPABASE_URL` | Yes | — | Throws at client creation if missing |
| `SUPABASE_SECRET_KEY` | Yes (or legacy) | — | Preferred; falls back to `SUPABASE_SERVICE_ROLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | No (legacy) | — | Accepted as fallback |
| `WRITE_SUPABASE` | No | `true` | **Risky default:** missing credentials + default `true` = immediate throw on startup |
| `WRITE_LOCAL_JSON` | No | `false` | Set `true` to also write shard JSON to disk |

**Gap:** `NOTION_DATABASE_URL`, `NOTION_DATA_SOURCE_URL`, `RUN_ID`, `MAX_ITEMS`, `DRY_RUN` are used by `push-to-notion.mjs` but are not documented in `.env.example`.

### Checks and outcomes

| Check | Result |
|---|---|
| Credentials validated at client creation, not silently ignored | **Pass** — throws `Error` with clear message if `SUPABASE_URL` or key is missing |
| `WRITE_SUPABASE=false` cleanly skips all DB calls | **Pass** — checked before client creation in all three scripts |
| Merge path works without local JSON | **Pass** — `merge-feedback-shards.mjs` reads from `feedback_items` via Supabase when `WRITE_LOCAL_JSON=false` |
| Merge requires at least one of local JSON or Supabase | **Pass** — explicit `throw` if both are disabled |
| `updated_at` auto-maintained by triggers | **Pass** — `set_updated_at()` trigger on all three tables |

### Risks

**Blocking:**
- `WRITE_SUPABASE` defaults to `true`. A developer running without credentials set in `.env` will get an immediate crash on any pipeline script. This is acceptable for production but is a poor local developer experience. Consider defaulting to `false` for local runs.

**Non-blocking:**
- `dedupe_key` has a globally unique constraint with no run scope. If the same verbatim quote appears in two different weekly runs, the second extraction silently overwrites the `run_id`, `call_id`, and other fields on the first row. Per-run counts derived from `feedback_items` may be inaccurate as a result. This appears intentional (deduplication across runs), but the behavior should be explicitly documented.
- `extract-feedback-call.mjs` sets `feedback_runs.status = 'failed'` on any per-call error. With concurrent worker agents, a single failed call poisons the entire run's status, even if all other calls succeed. The Notion sync checks `notion_page_id IS NULL` (not run status), so Notion sync still works, but the run appears failed in Supabase dashboards. Consider a separate `partial` status or per-call failure isolation.
- `.env.example` is missing Notion-related vars (`NOTION_DATABASE_URL`, `NOTION_DATA_SOURCE_URL`) and Notion sync runtime controls (`RUN_ID`, `MAX_ITEMS`, `DRY_RUN`).

---

## 3. Slack Integration

### Audit verdict: **Missing from repo**

A full search across all `.mjs`, `.js`, `.ts`, `.json`, `.sh`, and `.md` files returned zero matches for `slack` or `SLACK`. There are no:
- Slack SDK dependencies in `package.json`
- Slack API calls or webhook calls in any script
- `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`, or similar env vars in `.env.example` or any script
- npm scripts that post to Slack
- Automation hooks that trigger a Slack step

`README.md` step 4 ("Slacks Top Feedback to `#field-report`") describes behavior that does not exist in this codebase.

### Recommended action

Choose one of:

1. **Remove the claim** — Update `README.md` to remove step 4 and reflect the actual implemented pipeline (extraction → Supabase → Notion).
2. **Implement the step** — Add a `scripts/post-to-slack.mjs` that reads the top N items from Supabase (or from the merged `feedback.json`) and posts to `#field-report` via Slack's Incoming Webhooks or Web API. Register a `SLACK_WEBHOOK_URL` env var in `.env.example`.

---

## Summary

| Integration | Status | Blocking Risks | Non-blocking Follow-ups |
|---|---|---|---|
| **Notion** | Implemented via MCP agent | `cursor-agent` / MCP auth not verifiable pre-run; `existing-in-notion` sentinel unreliable for row counts | Hardcoded `SUPABASE_PROJECT_ID` default; name-based DB lookup ambiguity |
| **Supabase** | Implemented via JS client | `WRITE_SUPABASE=true` default crashes without credentials; concurrent worker failure poisons full run status | Global `dedupe_key` uniqueness should be documented; `.env.example` missing Notion sync vars |
| **Slack** | **Not implemented** | README claim is documentation drift, not a runtime risk | Either remove README claim or implement `post-to-slack.mjs` with `SLACK_WEBHOOK_URL` |

### Preflight checklist before production run

- [ ] `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set in `.env.local`
- [ ] `cursor-agent` is available: `which cursor-agent`
- [ ] Notion MCP and Supabase MCP are authenticated in Cursor
- [ ] `NOTION_DATABASE_URL` is set (avoids ambiguous name search)
- [ ] `SUPABASE_PROJECT_ID` is set explicitly (avoids hardcoded default)
- [ ] Run `DRY_RUN=true RUN_ID=<run-id> node scripts/push-to-notion.mjs` and confirm expected item counts before live sync
- [ ] Verify `notion_page_id` updates landed: query `SELECT COUNT(*) FROM feedback_items WHERE notion_page_id IS NOT NULL AND notion_page_id != 'existing-in-notion'`
