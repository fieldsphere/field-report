import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMergedPayload,
  mapDbItemToPayloadItem,
  mergedItems,
} from "../scripts/lib/merge-feedback-payload.mjs";

test("mapDbItemToPayloadItem applies expected defaults", () => {
  const payloadItem = mapDbItemToPayloadItem({
    call_id: "call-123",
    call_title: "Cursor <> Acme",
    call_date: "2026-04-03T19:43:51.322+00:00",
    gong_url: "https://app.gong.io/call?id=call-123",
    field_engineer: "Joseph Yang",
    customer_account: null,
    feedback_type: "Feature Request",
    summary: "Need cost controls",
    verbatim_quote: null,
    severity: null,
    evidence_speaker: null,
    evidence_timestamp: null,
    confidence: null,
    dedupe_key: "call-123:abc12345",
  });

  assert.deepEqual(payloadItem, {
    callId: "call-123",
    callTitle: "Cursor <> Acme",
    callDate: "2026-04-03",
    gongUrl: "https://app.gong.io/call?id=call-123",
    fieldEngineer: "Joseph Yang",
    customerAccount: "",
    feedbackType: "Feature Request",
    summary: "Need cost controls",
    verbatimQuote: "",
    severity: "Low",
    evidenceSpeaker: "",
    evidenceTimestamp: "",
    confidence: "Low",
    dedupeKey: "call-123:abc12345",
  });
});

test("mergedItems dedupes across shard files", () => {
  const items = mergedItems([
    {
      callId: "call-123",
      items: [
        {
          dedupeKey: "call-123:abc12345",
          verbatimQuote: "Need better pricing",
          summary: "short",
        },
      ],
    },
    {
      callId: "call-123",
      items: [
        {
          dedupeKey: "call-123:abc12345",
          verbatimQuote:
            "Need better pricing visibility and per-session cost tracking",
          summary: "long",
        },
        {
          dedupeKey: "call-123:def67890",
          verbatimQuote: "CLI is great",
          summary: "unique",
        },
      ],
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(
    items.find((item) => item.dedupeKey === "call-123:abc12345")?.summary,
    "long",
  );
});

test("buildMergedPayload computes total items from merged items", () => {
  const payload = buildMergedPayload({
    generatedAt: "2026-04-03T23:30:25.498Z",
    modelId: "anthropic/claude-sonnet-4-20250514",
    runId: "quick-smoke-20260403-1943",
    callsProcessed: 1,
    items: [{ dedupeKey: "call-123:abc12345" }, { dedupeKey: "call-123:def67890" }],
  });

  assert.equal(payload.totalFeedbackItems, 2);
  assert.equal(payload.runId, "quick-smoke-20260403-1943");
  assert.equal(payload.modelUsed, "anthropic/claude-sonnet-4-20250514");
});
