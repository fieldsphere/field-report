---
name: gong-weekly-feedback-run
description: Parent workflow entry point for weekly Gong feedback extraction. Selects weekly calls, prepares run shards, fans out one worker agent per call, then merges shard outputs into a run-specific feedback file.
---

# Gong Weekly Feedback Run

Use this as the top-level entry point for the weekly Gong workflow.

## What this workflow owns

- Runs call selection for the week.
- Prepares a run manifest and per-call input shards under `data/runs/<runId>/`.
- Launches one worker agent per call (`.cursor/agents/gong-feedback-call-agent.md`).
- Launches a final Notion sync agent when feedback should be published (`.cursor/agents/gong-feedback-notion-sync-agent.md`).
- Merges shard outputs into `data/runs/<runId>/feedback.json` by default.
- Stores the selected-call payload under `data/runs/<runId>/selected-calls.json`.
- Keeps weeks isolated by default (no `processed-calls.json` read/write).
- Uses Supabase as the source of truth for Notion sync.

## Entry

From repo root:

- `bash .cursor/skills/gong/weekly-feedback-run/scripts/run-weekly-feedback.sh`

## Required environment

- Gong credentials in `.env` / `.env.local`:
  - `GONG_ACCESS_KEY`
  - `GONG_ACCESS_SECRET` or `GONG_ACCESS_KEY_SECRET`
- Date window defaults to previous full Sunday -> Sunday (UTC). Optional:
  - `DATE_WINDOW_MODE=rolling-days` (uses `DAYS`)
  - `FROM_DATETIME` and `TO_DATETIME` to force an exact range

## Typical run sequence

1. Initialize run:
   - `bash .cursor/skills/gong/weekly-feedback-run/scripts/run-weekly-feedback.sh`
2. Read manifest:
   - `data/runs/<runId>/manifest.json`
3. Fan out one agent per manifest call:
   - Agent prompt should run:
     - `RUN_ID=<runId> CALL_ID=<callId> node scripts/extract-feedback-call.mjs`
4. Finalize once all shard files are present:
   - `RUN_ID=<runId> UPDATE_PROCESSED_CALLS=false node scripts/merge-feedback-shards.mjs`
5. Sync this weekly run directly to Notion via MCP:
   - `RUN_ID=<runId> node scripts/push-to-notion.mjs`
6. Optional canonical publish:
   - `RUN_ID=<runId> WRITE_CANONICAL_FEEDBACK=true node scripts/merge-feedback-shards.mjs`

## Output contract

- Shards: `data/runs/<runId>/calls/<callId>.json`
- Weekly merged output: `data/runs/<runId>/feedback.json`
- Weekly selected calls snapshot: `data/runs/<runId>/selected-calls.json`
- Optional canonical output: `data/feedback.json`
- Source of truth: Supabase tables `feedback_runs`, `feedback_calls`, and `feedback_items`
- Notion write path: MCP agent using Notion MCP + Supabase MCP

## Safety rules

- Worker agents must not write `feedback.json` or `processed-calls.json`.
- Parent flow is the only writer for aggregate files.
- Weekly isolation defaults:
  - `USE_PROCESSED_CALLS=false` during run preparation
  - `UPDATE_PROCESSED_CALLS=false` during merge
- Storage defaults:
  - `WRITE_SUPABASE=true`
  - `WRITE_LOCAL_JSON=false`
