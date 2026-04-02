---
name: gong-field-report-weekly-runs-insights
description: Analyze the Notion field-report Weekly Runs database to identify cross-week feedback patterns and produce a concise holistic summary. Use when the user asks for weekly run synthesis, trends across summaries/verdicts, or a high-level readout of the Weekly Runs DB.
---

# Field Report Weekly Runs Insights

Use this skill to synthesize the `field-report` database into a single weekly-to-quarterly narrative.

## Targets

- Parent page: `field-report`
- Database: `Weekly Runs`
- Data source URL: `collection://1da23e64-222e-428b-8ee8-8b557f135335`

## Workflow

1. Pull all rows from Weekly Runs via `notion-query-data-sources` in SQL mode.
2. Prefer row properties for synthesis:
   - `Name`
   - `Week Start`
   - `Run Date`
   - `Summary` (if present)
   - `Verdict` (if present)
   - `Calls Processed`
   - `Feedback Items`
3. If `Summary`/`Verdict` properties do not exist or are sparse:
   - Fetch row pages and extract equivalent signals from page content sections.
4. Build trend signals:
   - Repeated pain points and repeated wins
   - Direction of change across weeks
   - Volume context using calls processed and feedback item counts
5. Produce concise output in the format below.

## Output Format

### 1) Exec Snapshot (concise)

- 5-8 bullets max.
- Each bullet should include at least one concrete signal (week name/date or count).

### 2) Holistic Summary (structured but concise)

- `What this DB represents`: one short paragraph.
- `Top patterns`: 3-5 bullets (cross-week themes).
- `Trend direction`: improving / stable / worsening with short justification.
- `Risks and opportunities`: 2-4 bullets.
- `Next-week focus`: 3 concrete actions.

## Rules

- Do not invent missing summaries or verdicts.
- If data is missing, say what is missing and lower confidence.
- Keep language direct and short.
- Prefer pattern statements supported by at least 2 weeks unless explicitly labeled as a one-off.

