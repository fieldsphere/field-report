#!/usr/bin/env bash
set -euo pipefail

GONG_SUMMARY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"

cd "$GONG_SUMMARY_DIR"
node "scripts/extract-feedback.mjs"
