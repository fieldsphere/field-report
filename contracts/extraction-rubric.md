# Extraction Rubric

Contract for how Skill 2 (`gong-feedback-extractor`) identifies and structures feedback items from Gong call transcripts.

## Feedback taxonomy

| Type | Definition | Example |
|------|-----------|---------|
| **Feature Request** | Customer asks for a new capability, workflow, or integration that does not exist today | "It would be great if we could configure models per workspace" |
| **Bug Report** | Customer describes something broken, incorrect, or unexpectedly failing | "When I try to use autocomplete in large files it just freezes" |
| **Friction** | Customer describes confusion, slowness, awkward workflow, onboarding pain, or usability difficulty — even without an explicit request | "We spent a while figuring out how to set up SSO, the docs weren't clear" |
| **Complaint** | Stronger negative dissatisfaction, often tied to risk, disappointment, or escalation | "We're really frustrated that this hasn't been fixed after three months" |
| **Praise** | Explicit positive reaction **about the Cursor product** (editor, agent, models, integrations, etc.) worth preserving for product signal | "The team loves the new agent mode, it's saved us hours" |
| **Other** | Useful **Cursor product** feedback that does not fit the above categories | "We've been comparing you to Windsurf and the main difference is..." |

### Taxonomy rules

- If feedback could be both `Friction` and `Complaint`, use `Complaint` only when there is clear escalation language or stated risk (churn, executive involvement, timeline pressure).
- If feedback could be both `Feature Request` and `Friction`, prefer `Feature Request` when the customer names a specific capability; prefer `Friction` when they describe a pain point without proposing a solution.
- `Praise` must be about **Cursor the product**, not about the meeting, the POC, or the Cursor team’s facilitation. Generic pleasantries ("thanks for your time") or "great session" without product substance do not count.
- Extract customer voice only. Internal Cursor speakers must be excluded from final feedback items.

### Exclusions — do not extract

These are **out of scope** for `feedback.json`, even if the customer said them on the call:

1. **Non–Cursor product / third-party tools**  
   Problems or wishes about **other** products or environments (Zoom, Teams, calendar apps, OS notifications, email reminders, VPN, browser, etc.) unless the ask is explicitly about **Cursor** behavior (e.g. a Cursor calendar integration or in-app reminder).  
   *Drop example:* "No popup notification for Zoom meetings, so people forget and miss calls" — not about Cursor.

2. **Meeting logistics and lightweight collateral asks**  
   Requests about **slides, decks, agendas,** "send me the materials," scheduling the next session, or sharing PDFs **for reference** when there is **no** tie to Cursor product behavior, documentation site content as product feedback, or a feature in the app.  
   *Drop example:* "Can you share the beginning slides for future reference?" when it is generic enablement collateral, not feedback on Cursor itself.

3. **Generic session / engagement praise (not product)**  
   Appreciation for the **kickoff**, **POC**, **workshop**, **session quality**, **facilitation**, or **team engagement** without a concrete link to **Cursor product** experience (features, UX in the editor, reliability, pricing model in-product, etc.).  
   *Drop examples:* "Appreciation for the kickoff and finds it valuable"; "Appreciates the context and encourages engagement during POC" — unless the quote also names a specific product issue or win.

When in doubt, **omit**: the pipeline optimizes for **actionable Cursor product signal**, not a transcript of everything the customer said.

## Evidence requirements

Every extracted feedback item must include:

| Field | Required | Rule |
|-------|----------|------|
| `summary` | always | 1-2 sentence normalized summary of the feedback |
| `verbatimQuote` | always (MVP) | closest relevant quote from the transcript. If no usable quote can be found, drop the item. |
| `feedbackType` | always | one of the six taxonomy values |
| `severity` | always | `High` = blocks adoption or causes churn risk; `Medium` = meaningful pain but workaround exists; `Low` = nice-to-have or minor annoyance |
| `evidenceSpeaker` | best effort | name of the person who said it, resolved from `speakerId` to participant name when possible |
| `evidenceTimestamp` | best effort | approximate time in the call (e.g. "12:34") derived from sentence timing if available |
| `confidence` | always | `High` = clear, unambiguous feedback; `Medium` = likely feedback but context is somewhat ambiguous; `Low` = inferred or indirect |

### MVP rule

In the MVP (first 10 calls), **drop items that lack a verbatim quote**. This keeps extracted rows auditable and makes the manual review loop precise.

## Dedupe rules

### Within a single call

- If the same topic comes up multiple times in one call, extract it once with the strongest quote.
- If two distinct feedback items happen to share similar language but are about different features or issues, keep both.

### Across pipeline re-runs

- Each item gets a `dedupeKey`: `callId + ":" + sha256(normalize(verbatimQuote)).slice(0, 8)`
- Skill 2 tracks processed call IDs in `gong-summary/data/processed-calls.json` to skip already-extracted calls on re-run.
- Skill 3 checks Notion for existing `Dedupe Key` before inserting.

## Long transcript handling

For transcripts that exceed the model's practical input window:

1. **Chunk**: split the transcript into overlapping windows of ~80k tokens with ~5k token overlap.
2. **Extract per chunk**: run the extraction prompt on each chunk independently.
3. **Merge per call**: deduplicate candidate items from all chunks using normalized quote similarity (>80% overlap = same item; keep the version with the longer quote).

For the MVP (10 calls), most transcripts should fit in a single pass. Chunking only activates when needed.
