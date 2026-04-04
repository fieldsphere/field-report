#!/usr/bin/env bash
set -euo pipefail

FIELD_REPORT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"

cd "$FIELD_REPORT_DIR"

if [[ -z "${RUN_ID:-}" ]]; then
  RUN_ID="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
  export RUN_ID
fi

RUN_DIR="$FIELD_REPORT_DIR/data/runs/$RUN_ID"
SELECTED_CALLS_PATH="$RUN_DIR/selected-calls.json"

echo "Using RUN_ID=$RUN_ID"
echo "Using RUN_DIR=$RUN_DIR"
OUTPUT_PATH="$SELECTED_CALLS_PATH" node "scripts/select-calls.mjs"
SELECTED_CALLS_PATH="$SELECTED_CALLS_PATH" RUN_DIR="$RUN_DIR" USE_PROCESSED_CALLS=false node "scripts/prepare-feedback-run.mjs"

MANIFEST_PATH="$FIELD_REPORT_DIR/data/runs/$RUN_ID/manifest.json"
echo ""
echo "Weekly run manifest created:"
echo "  $MANIFEST_PATH"
echo ""
echo "Next steps:"
echo "  1) Launch one worker agent per call from the manifest."
echo "  2) After all shards complete, merge them:"
echo "     RUN_ID=$RUN_ID UPDATE_PROCESSED_CALLS=false node scripts/merge-feedback-shards.mjs"
echo "  3) Analyze this run into ranked weekly themes:"
echo "     RUN_ID=$RUN_ID node scripts/analyze-feedback-run.mjs"
echo "  4) Post top themes to Slack (or DRY_RUN=true to preview):"
echo "     RUN_ID=$RUN_ID node scripts/post-to-slack.mjs"
echo "  5) Sync this weekly run to Notion via MCP:"
echo "     RUN_ID=$RUN_ID node scripts/push-to-notion.mjs"
echo "  6) Optional: publish this week's result as canonical feedback.json:"
echo "     RUN_ID=$RUN_ID WRITE_CANONICAL_FEEDBACK=true node scripts/merge-feedback-shards.mjs"
