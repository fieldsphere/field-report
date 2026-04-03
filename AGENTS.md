# Field Report Automation

## Cursor Cloud specific instructions

### Overview

This is a Node.js pipeline (all `.mjs` scripts) that extracts customer feedback from Gong call transcripts, persists to Supabase, and optionally syncs to Notion. See `docs/architecture.md` for the full flow diagram.

### Running scripts

All scripts are invoked via `npm run <script>` — see `package.json` for the full list. The three main entry points:

- `npm run gong:select` — select Gong calls (writes `data/selected-calls.json`)
- `npm run gong:extract` — extract feedback from selected calls
- `npm run gong:weekly-feedback` — full weekly pipeline (shell script launcher)

### Environment variables

Scripts load `.env.local` then `.env` via `dotenv`. In Cloud Agent VMs, all required secrets (`GONG_ACCESS_KEY`, `GONG_ACCESS_KEY_SECRET`, `GONG_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) are injected as environment variables — no `.env` file is needed.

### Key caveats

- **No lint/test tooling**: The repo has no ESLint config, no TypeScript, and no test suite (`npm test` just echoes an error). Syntax-check scripts with `node --check <file>`.
- **`WRITE_SUPABASE` defaults to `true`**: If Supabase credentials are missing, any pipeline script will throw immediately. Set `WRITE_SUPABASE=false` for offline/local-only runs.
- **`WRITE_LOCAL_JSON=true`** enables writing shard outputs to `data/` directory alongside (or instead of) Supabase.
- **Notion sync** requires `cursor-agent` CLI on `$PATH` and authenticated Notion + Supabase MCP servers — it is optional for core extraction testing.
- **No dev server**: This is a batch pipeline, not a web app. There is no `dev` or `start` command. Scripts are run individually.
- **Data directory**: All local output goes to `data/` (gitignored). Archived runs go to `data/runs/<runId>/`.
