# feedback.json

Contract for the output of Skill 2 (`gong-feedback-extractor`) and the input of Skill 3 (`notion-feedback-sync`).

Written to `data/feedback.json`.

## Schema

```json
{
  "generatedAt": "2026-03-30T17:00:00.000Z",
  "modelUsed": "anthropic/claude-sonnet-4-20250514",
  "callsProcessed": 10,
  "totalFeedbackItems": 23,
  "items": [
    {
      "callId": "4437983060289915613",
      "callTitle": "Anaconda // Cursor",
      "callDate": "2026-03-23",
      "gongUrl": "https://us-4796.app.gong.io/call?id=4437983060289915613",
      "fieldEngineer": "Ryan Sudhakaran",
      "customerAccount": "Anaconda",
      "feedbackType": "Feature Request",
      "summary": "Customer wants the ability to configure model selection per-workspace so different teams can use different models.",
      "verbatimQuote": "It would be really helpful if each team could pick their own default model instead of having one global setting.",
      "severity": "Medium",
      "evidenceSpeaker": "Enrique Jenkins",
      "evidenceTimestamp": "12:34",
      "confidence": "High",
      "dedupeKey": "4437983060289915613:a1b2c3d4"
    }
  ]
}
```

## Field definitions

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `generatedAt` | ISO 8601 string | script clock | when this file was produced |
| `modelUsed` | string | AI Gateway | model identifier used for extraction |
| `callsProcessed` | integer | computed | how many calls were analyzed |
| `totalFeedbackItems` | integer | computed | total items across all calls |
| `items[].callId` | string | from `selected-calls.json` | Gong call ID (primary grouping key) |
| `items[].callTitle` | string | from `selected-calls.json` | call title |
| `items[].callDate` | `YYYY-MM-DD` | derived from `started` | date only, for Notion date property |
| `items[].gongUrl` | string | from `selected-calls.json` | link to Gong recording |
| `items[].fieldEngineer` | string | from `matchedParticipants` | FE name(s) on the call |
| `items[].customerAccount` | string | LLM-inferred | best-effort customer/company name |
| `items[].feedbackType` | enum | LLM output | one of: `Feature Request`, `Bug Report`, `Friction`, `Complaint`, `Praise`, `Other` |
| `items[].summary` | string | LLM output | 1-2 sentence normalized summary |
| `items[].verbatimQuote` | string | LLM output | closest quote from transcript |
| `items[].severity` | enum | LLM output | `High`, `Medium`, `Low` |
| `items[].evidenceSpeaker` | string | LLM output | best-effort speaker name |
| `items[].evidenceTimestamp` | string | LLM output | best available time reference (e.g. "12:34") |
| `items[].confidence` | enum | LLM output | `High`, `Medium`, `Low` — extraction confidence |
| `items[].dedupeKey` | string | computed | `callId` + `:` + first 8 chars of SHA-256 of normalized `verbatimQuote` |

## Dedupe key

```
dedupeKey = callId + ":" + sha256(normalizeWhitespace(lowercase(verbatimQuote))).slice(0, 8)
```

One Gong call can produce multiple feedback items. The `dedupeKey` prevents the same quote from being inserted twice if the pipeline re-runs.
