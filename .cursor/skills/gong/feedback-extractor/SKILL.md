---
name: gong-feedback-extractor
description: Fetch Gong call transcripts and extract structured feedback items (feature requests, bugs, friction, complaints, praise) using AI Gateway. Use when analyzing selected calls and generating feedback.json for Notion sync.
---

# Gong Feedback Extractor

Use this skill after `/gong-call-selector` to produce `gong-summary/data/feedback.json`.

## When to Use

- User asks to identify product feedback from Gong calls
- User wants bugs and feature requests extracted from transcripts
- You need structured output for `/notion-feedback-sync`

## Input

- `gong-summary/data/selected-calls.json`
- Env vars in `gong-summary/.env` and `gong-summary/.env.local`

## Instructions

1. From repo root, run:
   - `bash gong-summary/.cursor/skills/gong/feedback-extractor/scripts/extract-feedback.sh`
2. For MVP:
   - `CALL_LIMIT=10 USE_PROCESSED_CALLS=false bash gong-summary/.cursor/skills/gong/feedback-extractor/scripts/extract-feedback.sh`
3. Confirm output:
   - `gong-summary/data/feedback.json`
   - optional `gong-summary/data/processed-calls.json`

## Output Contract

- Primary file: `gong-summary/data/feedback.json`
- Contract docs:
  - `gong-summary/contracts/feedback.md`
  - `gong-summary/contracts/extraction-rubric.md`
  - `gong-summary/.cursor/skills/gong/feedback-extractor/references/feedback-schema.md`

## Notes

- The script deduplicates per call using `callId + quote hash`.
- If transcripts are long, it chunks and merges extracted items.
- MVP rule is quote-first: items without a quote are dropped.
- **Exclusions:** Do not extract non-Cursor issues (e.g. Zoom notifications), meeting-only logistics (e.g. “share the slides”), or generic session praise with no product tie — see `gong-summary/contracts/extraction-rubric.md` § Exclusions.
- For weekly fan-out runs, use `/gong-weekly-feedback-run` and the per-call worker agent instead of writing canonical output from multiple workers.
