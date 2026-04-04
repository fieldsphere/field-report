import { dedupeItems } from "./extract-feedback-core.mjs";

export function mergedItems(shards) {
  const allItems = shards.flatMap((shard) =>
    Array.isArray(shard.items) ? shard.items : [],
  );
  return dedupeItems(allItems);
}

export function mapDbItemToPayloadItem(item) {
  return {
    callId: item.call_id,
    callTitle: item.call_title ?? "",
    callDate: item.call_date ? String(item.call_date).slice(0, 10) : "",
    gongUrl: item.gong_url ?? "",
    fieldEngineer: item.field_engineer ?? "",
    customerAccount: item.customer_account ?? "",
    feedbackType: item.feedback_type,
    summary: item.summary,
    verbatimQuote: item.verbatim_quote ?? "",
    severity: item.severity ?? "Low",
    evidenceSpeaker: item.evidence_speaker ?? "",
    evidenceTimestamp: item.evidence_timestamp ?? "",
    confidence: item.confidence ?? "Low",
    dedupeKey: item.dedupe_key,
  };
}

export function buildMergedPayload({
  generatedAt = new Date().toISOString(),
  modelId,
  runId,
  callsProcessed,
  items,
}) {
  return {
    generatedAt,
    modelUsed: modelId,
    runId,
    callsProcessed,
    totalFeedbackItems: items.length,
    items,
  };
}
