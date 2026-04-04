#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  archivePathFor,
  loadJson,
  loadProcessedCalls,
  saveJson,
  saveProcessedCalls,
} from "./lib/extract-feedback-core.mjs";
import {
  buildMergedPayload,
  mapDbItemToPayloadItem,
  mergedItems,
} from "./lib/merge-feedback-payload.mjs";
import {
  createSupabaseServiceClient,
  updateFeedbackRun,
  writeLocalJsonEnabled,
  writeSupabaseEnabled,
} from "./lib/supabase.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = resolve(projectRoot, "data");

const RUN_ID = process.env.RUN_ID?.trim() || "manual-run";
const SHARDS_DIR =
  process.env.SHARDS_DIR ?? resolve(dataDir, "runs", RUN_ID, "calls");
const OUTPUT_PATH =
  process.env.OUTPUT_PATH ?? resolve(dataDir, "runs", RUN_ID, "feedback.json");
const CANONICAL_OUTPUT_PATH =
  process.env.CANONICAL_OUTPUT_PATH ?? resolve(dataDir, "feedback.json");
const WRITE_CANONICAL_FEEDBACK =
  (process.env.WRITE_CANONICAL_FEEDBACK ?? "false") !== "false";
const PROCESSED_CALLS_PATH =
  process.env.PROCESSED_CALLS_PATH ?? resolve(dataDir, "processed-calls.json");
const MODEL_ID =
  process.env.EXTRACT_MODEL ?? "anthropic/claude-sonnet-4-20250514";
const UPDATE_PROCESSED_CALLS =
  (process.env.UPDATE_PROCESSED_CALLS ?? "false") !== "false";
const WRITE_SUPABASE = writeSupabaseEnabled();
const WRITE_LOCAL_JSON = writeLocalJsonEnabled();

function listJsonFiles(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
    .map((entry) => resolve(path, entry.name))
    .sort();
}

function shardCallIds(shards) {
  return [...new Set(shards.map((shard) => shard.callId).filter(Boolean))];
}

async function loadRunItemsFromSupabase(supabase) {
  const batchSize = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + batchSize - 1;
    const { data, error } = await supabase
      .from("feedback_items")
      .select("*")
      .eq("run_id", RUN_ID)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(`Failed to read feedback_items for run ${RUN_ID}: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return rows.map(mapDbItemToPayloadItem);
}

async function loadRunProcessedCallCount(supabase) {
  const { count, error } = await supabase
    .from("feedback_calls")
    .select("call_id", { count: "exact", head: true })
    .eq("run_id", RUN_ID)
    .eq("shard_status", "complete");
  if (error) {
    throw new Error(`Failed to count feedback_calls for run ${RUN_ID}: ${error.message}`);
  }
  return count ?? 0;
}

async function main() {
  const supabase = WRITE_SUPABASE ? createSupabaseServiceClient() : null;
  if (supabase) {
    await updateFeedbackRun(supabase, RUN_ID, { status: "merging" });
  }

  let shardFiles = [];
  let callsProcessed = [];
  let callsProcessedCount = 0;
  let items = [];

  if (WRITE_LOCAL_JSON) {
    shardFiles = listJsonFiles(SHARDS_DIR);
    if (shardFiles.length === 0) {
      throw new Error(`No shard JSON files found in ${SHARDS_DIR}`);
    }
    const shards = shardFiles.map((file) => loadJson(file));
    callsProcessed = shardCallIds(shards);
    callsProcessedCount = callsProcessed.length;
    items = mergedItems(shards);
  } else if (supabase) {
    items = await loadRunItemsFromSupabase(supabase);
    callsProcessedCount = await loadRunProcessedCallCount(supabase);
  } else {
    throw new Error(
      "Cannot merge shards with WRITE_LOCAL_JSON=false and WRITE_SUPABASE=false.",
    );
  }

  const payload = buildMergedPayload({
    generatedAt: new Date().toISOString(),
    modelId: MODEL_ID,
    runId: RUN_ID,
    callsProcessed: callsProcessedCount,
    items,
  });

  let archivedOutputPath = null;
  if (WRITE_LOCAL_JSON) {
    saveJson(OUTPUT_PATH, payload);
    archivedOutputPath = archivePathFor(OUTPUT_PATH, payload.generatedAt);
    saveJson(archivedOutputPath, payload);
  }

  if (WRITE_CANONICAL_FEEDBACK && WRITE_LOCAL_JSON) {
    saveJson(CANONICAL_OUTPUT_PATH, payload);
    const canonicalArchivePath = archivePathFor(
      CANONICAL_OUTPUT_PATH,
      payload.generatedAt,
    );
    saveJson(canonicalArchivePath, payload);
    console.error(`Wrote canonical feedback file to ${CANONICAL_OUTPUT_PATH}`);
  } else if (WRITE_CANONICAL_FEEDBACK && !WRITE_LOCAL_JSON) {
    console.error(
      "WRITE_CANONICAL_FEEDBACK was requested, but local writes are disabled (WRITE_LOCAL_JSON=false).",
    );
  }

  if (UPDATE_PROCESSED_CALLS && WRITE_LOCAL_JSON) {
    const processed = loadProcessedCalls(PROCESSED_CALLS_PATH);
    for (const callId of callsProcessed) {
      processed.add(callId);
    }
    saveProcessedCalls(PROCESSED_CALLS_PATH, processed);
  }

  if (supabase) {
    await updateFeedbackRun(supabase, RUN_ID, {
      status: "complete",
      calls_processed: callsProcessedCount,
      total_feedback_items: items.length,
      model_used: MODEL_ID,
      generated_at: payload.generatedAt,
    });
  }

  console.error(
    `Merged ${shardFiles.length} shard files and produced ${items.length} feedback items for run ${RUN_ID}`,
  );
  if (archivedOutputPath) {
    console.error(`Archived run snapshot to ${archivedOutputPath}`);
  }
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
