# Gong Call Selection Reference

Skill: `gong-call-selector`

## Endpoint

- `POST /v2/calls/extensive`

Uses `GONG_API_BASE_URL` when set (for example `https://us-XXXX.api.gong.io/v2`), otherwise falls back to `https://api.gong.io/v2`.

## Request shape

```json
{
  "filter": {
    "fromDateTime": "2026-03-23T16:10:12.803Z",
    "toDateTime": "2026-03-30T16:10:12.803Z"
  },
  "contentSelector": {
    "exposedFields": {
      "parties": true
    }
  },
  "cursor": "optional-pagination-cursor"
}
```

## Response fields used

- `calls[]` or `data[]` for call records
- `records.cursor` or `pagination.cursor` for pagination
- `metaData.id`, `metaData.title`, `metaData.started`, `metaData.url`, `metaData.duration`, `metaData.scope`
- `parties[]` with `name`, `title`, `affiliation`, and `speakerId`

## Filter logic

- Keep call if any `parties[].title` contains `PARTY_TITLE_SUBSTRING` (case-insensitive).
- Include full party list plus `matchedParticipants`.

## Output artifact

- `gong-summary/data/selected-calls.json`
