# feedback run shards

Contract for per-call files produced during weekly fan-out before canonical merge.

## Directory layout

```
gong-summary/data/runs/<runId>/
  manifest.json
  call-inputs/
    <callId>.json
  calls/
    <callId>.json
  feedback.json
```

- `manifest.json` is produced by `scripts/prepare-feedback-run.mjs`.
- `call-inputs/<callId>.json` is the exact call payload for one worker.
- `calls/<callId>.json` is the one-call extraction output for merge.
- `feedback.json` is the weekly merged output produced by `scripts/merge-feedback-shards.mjs`.

## manifest.json schema

```json
{
  "generatedAt": "2026-03-30T20:40:00.000Z",
  "runId": "2026-03-30T20-40-00Z",
  "runDir": "/absolute/path/to/gong-summary/data/runs/2026-03-30T20-40-00Z",
  "selectedCallsPath": "/absolute/path/to/gong-summary/data/selected-calls.json",
  "useProcessedCalls": false,
  "callLimit": null,
  "callsToProcess": 2,
  "calls": [
    {
      "callId": "4437983060289915613",
      "title": "Anaconda // Cursor",
      "callInputPath": "/absolute/path/to/gong-summary/data/runs/2026-03-30T20-40-00Z/call-inputs/4437983060289915613.json",
      "outputPath": "/absolute/path/to/gong-summary/data/runs/2026-03-30T20-40-00Z/calls/4437983060289915613.json"
    }
  ]
}
```

## calls/<callId>.json schema

```json
{
  "generatedAt": "2026-03-30T20:50:00.000Z",
  "modelUsed": "anthropic/claude-sonnet-4-20250514",
  "runId": "2026-03-30T20-40-00Z",
  "callId": "4437983060289915613",
  "totalFeedbackItems": 3,
  "items": [
    {
      "callId": "4437983060289915613",
      "callTitle": "Anaconda // Cursor",
      "callDate": "2026-03-23",
      "gongUrl": "https://us-4796.app.gong.io/call?id=4437983060289915613",
      "fieldEngineer": "Ryan Sudhakaran",
      "customerAccount": "Anaconda",
      "feedbackType": "Feature Request",
      "summary": "Customer asked for per-workspace model defaults.",
      "verbatimQuote": "It would help if each team could pick their own default model.",
      "severity": "Medium",
      "evidenceSpeaker": "Enrique Jenkins",
      "evidenceTimestamp": "12:34",
      "confidence": "High",
      "dedupeKey": "4437983060289915613:a1b2c3d4"
    }
  ]
}
```

## ownership rules

- Worker agents only write `calls/<callId>.json`.
- Parent workflow writes weekly aggregate `data/runs/<runId>/feedback.json` during merge.
- Weekly runs are independent by default:
  - do not filter by `processed-calls.json` unless explicitly enabled
  - do not update `processed-calls.json` unless explicitly enabled
