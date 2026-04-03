# Field Report Automation

This project is an automation pipeline that runs once a week to extract and share customer insights from field engineering calls.

## How it works

1. **Scrapes Field Eng Calls**: The automation automatically fetches and scrapes through transcripts of Field Engineer calls from Gong.
2. **Extracts Feedback**: It uses AI to analyze the transcripts and find valuable feedback from customers (feature requests, bug reports, friction, praise, etc.).
3. **Persists to Supabase**: Normalized feedback items, call metadata, and run state are stored in Supabase as the primary persistence layer.
4. **Syncs to Notion**: Deduplicated feedback items are synced from Supabase into a Notion database via MCP for tracking and visibility.
5. **Slacks Weekly Digest**: An LLM distills the top 5 most actionable items from the run and posts a digest to `#field-report` via Slack webhook.

## Scripts

- `npm run gong:weekly-feedback`: The main entry point to run the weekly extraction pipeline.
- `npm run gong:select`: Selects the relevant calls.
- `npm run gong:extract`: Extracts feedback from the selected calls.
- `npm run slack:digest`: Posts the top 5 weekly insights to Slack (`RUN_ID` required).

## Architecture

For more details on the end-to-end flow, see [docs/architecture.md](docs/architecture.md).