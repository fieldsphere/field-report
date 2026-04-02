# Notion Database Schema

Contract for the Notion database created and populated by Skill 3 (`notion-feedback-sync`).

## Database name

`Gong Field Engineer Feedback`

## Columns

| Column Name | Notion Property Type | Source Field | Notes |
|-------------|---------------------|--------------|-------|
| **Summary** | title | `items[].summary` | Notion requires one title column; this is the primary display |
| **Call Title** | rich_text | `items[].callTitle` | Gong call name |
| **Call Date** | date | `items[].callDate` | date only (`YYYY-MM-DD`) |
| **Gong URL** | url | `items[].gongUrl` | link to recording |
| **Field Engineer** | rich_text | `items[].fieldEngineer` | internal FE on the call |
| **Customer / Account** | rich_text | `items[].customerAccount` | best-effort customer name |
| **Feedback Type** | select | `items[].feedbackType` | options: `Feature Request`, `Bug Report`, `Friction`, `Complaint`, `Praise`, `Other` |
| **Severity** | select | `items[].severity` | options: `High`, `Medium`, `Low` |
| **Verbatim Quote** | rich_text | `items[].verbatimQuote` | closest relevant transcript quote |
| **Evidence Speaker** | rich_text | `items[].evidenceSpeaker` | who said it |
| **Evidence Timestamp** | rich_text | `items[].evidenceTimestamp` | approximate time in call |
| **Confidence** | select | `items[].confidence` | options: `High`, `Medium`, `Low` |
| **Dedupe Key** | rich_text | `items[].dedupeKey` | used to prevent duplicate inserts; not user-facing |

## Dedupe behavior

Before inserting a row, query the database for an existing row where `Dedupe Key` equals the item's `dedupeKey`. If found, skip the insert.

## Select option values

### Feedback Type
- Feature Request
- Bug Report
- Friction
- Complaint
- Praise
- Other

### Severity
- High
- Medium
- Low

### Confidence
- High
- Medium
- Low
