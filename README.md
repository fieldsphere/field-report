# Field Report Automation

This project is an automation pipeline that runs once a week to extract and share customer insights from field engineering calls.

## How it works

1. **Scrapes Field Eng Calls**: The automation automatically fetches and scrapes through transcripts of Field Engineer calls from Gong.
2. **Extracts Feedback**: It uses AI to analyze the transcripts and find valuable feedback from customers (feature requests, bug reports, friction, praise, etc.).
3. **Stores in Notion**: All extracted feedback items are normalized, deduplicated, and stored in a Notion database for tracking and visibility.
4. **Slacks Top Feedback**: It identifies the top 5 most important pieces of feedback from the week and posts them to the `#field-report` Slack channel.

## Scripts

- `npm run gong:weekly-feedback`: The main entry point to run the weekly extraction pipeline.
- `npm run gong:select`: Selects the relevant calls.
- `npm run gong:extract`: Extracts feedback from the selected calls.

## Architecture

For more details on the end-to-end flow, see [docs/architecture.md](docs/architecture.md).