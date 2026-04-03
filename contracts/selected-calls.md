# selected-calls.json

Contract for the output of Skill 1 (`gong-call-selector`) and the input of Skill 2 (`gong-feedback-extractor`).

Written to `data/selected-calls.json`.

## Schema

```json
{
  "generatedAt": "2026-03-30T16:10:12.803Z",
  "filter": {
    "fromDateTime": "2026-03-23T16:10:12.803Z",
    "toDateTime": "2026-03-30T16:10:12.803Z",
    "partyTitleSubstring": "Field Engineer"
  },
  "totalCalls": 725,
  "matched": 88,
  "calls": [
    {
      "callId": "4437983060289915613",
      "title": "Anaconda // Cursor",
      "started": "2026-03-23T10:01:35-07:00",
      "duration": 1714,
      "gongUrl": "https://us-4796.app.gong.io/call?id=4437983060289915613",
      "scope": "External",
      "parties": [
        {
          "name": "Enrique Jenkins",
          "title": "Head of IT Strategy and Operations",
          "affiliation": "External",
          "speakerId": "3414297816016805563"
        },
        {
          "name": "Ryan Sudhakaran",
          "title": "Field Engineer",
          "affiliation": "Internal",
          "speakerId": "4495051474251205435"
        }
      ],
      "matchedParticipants": [
        {
          "name": "Ryan Sudhakaran",
          "title": "Field Engineer"
        }
      ]
    }
  ]
}
```

## Field definitions

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `generatedAt` | ISO 8601 string | script clock | when this file was produced |
| `filter.fromDateTime` | ISO 8601 string | env `DAYS` | start of query window |
| `filter.toDateTime` | ISO 8601 string | env `DAYS` | end of query window |
| `filter.partyTitleSubstring` | string | env `PARTY_TITLE_SUBSTRING` | title match used |
| `totalCalls` | integer | Gong API | total calls in date range before filtering |
| `matched` | integer | computed | calls with at least one matching participant |
| `calls[].callId` | string | `metaData.id` from Gong | unique Gong call identifier |
| `calls[].title` | string | `metaData.title` | call title (usually "Customer // Company") |
| `calls[].started` | ISO 8601 string | `metaData.started` | actual start time |
| `calls[].duration` | integer | `metaData.duration` | seconds |
| `calls[].gongUrl` | string | `metaData.url` | link to recording in Gong |
| `calls[].scope` | string | `metaData.scope` | "External" or "Internal" |
| `calls[].parties[]` | array | `parties` from Gong | all participants, not just matches |
| `calls[].parties[].name` | string | Gong | participant name |
| `calls[].parties[].title` | string | Gong | job title |
| `calls[].parties[].affiliation` | string | Gong | "Internal" or "External" |
| `calls[].parties[].speakerId` | string | Gong | links to transcript utterances |
| `calls[].matchedParticipants[]` | array | computed | subset whose title matched the filter |
