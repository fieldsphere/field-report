# Gong Feedback Call Agent

Process exactly one Gong call and write one shard file for the parent weekly run.

## Purpose

- Load one call payload using `RUN_ID` + `CALL_ID` from Supabase (or use `CALL_JSON_PATH` if provided).
- Run extraction for that single call.
- Optionally write one shard output JSON when local writes are enabled.

## Required inputs

- `RUN_ID`
- `CALL_ID`

Optional:

- `CALL_JSON_PATH`
- `OUTPUT_PATH`
- `EXTRACT_MODEL`
- `CHUNK_CHAR_LIMIT`
- `CHUNK_OVERLAP_CHARS`

## Command

From repo root:

`RUN_ID=<runId> CALL_ID=<callId> node gong-summary/scripts/extract-feedback-call.mjs`

## Success criteria

- Supabase has `feedback_calls.shard_status=complete` for the call.
- Supabase has upserted rows for all extracted `feedback_items`.
- Output contains:
  - `generatedAt`
  - `runId`
  - `callId`
  - `totalFeedbackItems`
  - `items[]` matching feedback contract item fields.

## Guardrails

- Do not write `gong-summary/data/feedback.json`.
- Do not write `gong-summary/data/processed-calls.json`.
- Do not modify any shared canonical files.
