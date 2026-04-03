#!/usr/bin/env bash
set -euo pipefail

FIELD_REPORT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"

cd "$FIELD_REPORT_DIR"
node "scripts/select-calls.mjs"
