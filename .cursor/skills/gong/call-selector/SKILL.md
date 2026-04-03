---
name: gong-call-selector
description: Select Gong calls where participant titles match a target role (default Field Engineer) and write normalized call metadata JSON for downstream processing. Use when filtering Gong calls, creating call batches, or starting the feedback extraction workflow.
---

# Gong Call Selector

Use this skill to build `data/selected-calls.json` from Gong calls.

## When to Use

- User asks to find calls with Field Engineers
- User wants a filtered call set for transcript analysis
- You need the input artifact for `/gong-feedback-extractor`

## Inputs

- Env vars from `.env` and `.env.local`
- Optional overrides:
  - `DAYS` (default `7`)
  - `PARTY_TITLE_SUBSTRING` (default `Field Engineer`)
  - `LIMIT_CALLS` (default `0`, meaning no limit)
  - `OUTPUT_PATH` (default `data/selected-calls.json`)

## Instructions

1. From repo root, run:
   - `bash .cursor/skills/gong/call-selector/scripts/select-calls.sh`
2. For MVP runs, set `LIMIT_CALLS=10`.
3. Confirm output file exists and has:
   - `generatedAt`, `filter`, `totalCalls`, `matched`, and `calls[]`.

## Output Contract

- Primary file: `data/selected-calls.json`
- Contract docs:
  - `contracts/selected-calls.md`
  - `.cursor/skills/gong/call-selector/references/sample-output.json`

## Notes

- The script keeps all parties on a call and also includes `matchedParticipants`.
- This skill is read-write and intended to be run before transcript extraction.
- For the full weekly workflow with per-call workers, start from `/gong-weekly-feedback-run`.
