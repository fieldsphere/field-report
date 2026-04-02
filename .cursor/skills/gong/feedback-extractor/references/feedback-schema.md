# Feedback Output Schema

Output file: `gong-summary/data/feedback.json`

Top-level object:

- `generatedAt` (string, ISO datetime)
- `modelUsed` (string)
- `callsProcessed` (number)
- `totalFeedbackItems` (number)
- `items` (array)

Each `items[]` entry:

- `callId` (string)
- `callTitle` (string)
- `callDate` (string, `YYYY-MM-DD`)
- `gongUrl` (string)
- `fieldEngineer` (string)
- `customerAccount` (string)
- `feedbackType` (enum: `Feature Request` | `Bug Report` | `Friction` | `Complaint` | `Praise` | `Other`)
- `summary` (string)
- `verbatimQuote` (string)
- `severity` (enum: `High` | `Medium` | `Low`)
- `evidenceSpeaker` (string)
- `evidenceTimestamp` (string, best-effort `MM:SS`)
- `confidence` (enum: `High` | `Medium` | `Low`)
- `dedupeKey` (string, `callId:hash8`)
