#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  loadJson,
  loadProcessedCalls,
  saveJson,
} from "./lib/extract-feedback-core.mjs";
import {
  createSupabaseServiceClient,
  upsertFeedbackCalls,
  upsertFeedbackRun,
  writeLocalJsonEnabled,
  writeSupabaseEnabled,
} from "./lib/supabase.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = resolve(projectRoot, "data");

const SELECTED_CALLS_PATH =
  process.env.SELECTED_CALLS_PATH ?? resolve(dataDir, "selected-calls.json");
const PROCESSED_CALLS_PATH =
  process.env.PROCESSED_CALLS_PATH ?? resolve(dataDir, "processed-calls.json");
const RUN_ID = process.env.RUN_ID?.trim() || new Date().toISOString().replace(/[:.]/g, "-");
const RUN_DIR = process.env.RUN_DIR ?? resolve(dataDir, "runs", RUN_ID);
const USE_PROCESSED_CALLS = (process.env.USE_PROCESSED_CALLS ?? "false") !== "false";
const WRITE_SUPABASE = writeSupabaseEnabled();
const WRITE_LOCAL_JSON = writeLocalJsonEnabled();
const parsedCallLimit = Number(process.env.CALL_LIMIT);
const CALL_LIMIT =
  Number.isFinite(parsedCallLimit) && parsedCallLimit > 0
    ? Math.floor(parsedCallLimit)
    : null;

function selectCalls(selectedPayload, processedCallIds) {
  const all = selectedPayload.calls ?? [];
  const unprocessed = all.filter((call) =>
    USE_PROCESSED_CALLS ? !processedCallIds.has(call.callId) : true,
  );
  return CALL_LIMIT ? unprocessed.slice(0, CALL_LIMIT) : unprocessed;
}

function callPayloadPath(runDir, callId) {
  return resolve(runDir, "call-inputs", `${callId}.json`);
}

function shardOutputPath(runDir, callId) {
  return resolve(runDir, "calls", `${callId}.json`);
}

function parseIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function main() {
  if (!existsSync(SELECTED_CALLS_PATH)) {
    throw new Error(`Missing selected calls file: ${SELECTED_CALLS_PATH}`);
  }

  const selected = loadJson(SELECTED_CALLS_PATH);
  const generatedAt = new Date().toISOString();
  const processed = USE_PROCESSED_CALLS
    ? loadProcessedCalls(PROCESSED_CALLS_PATH)
    : new Set();
  const calls = selectCalls(selected, processed);
  const supabase = WRITE_SUPABASE ? createSupabaseServiceClient() : null;

  const manifestCalls = calls.map((call) => {
    const inputPath = callPayloadPath(RUN_DIR, call.callId);
    const outputPath = shardOutputPath(RUN_DIR, call.callId);
    if (WRITE_LOCAL_JSON) {
      saveJson(inputPath, call);
    }
    return {
      callId: call.callId,
      title: call.title ?? "",
      callInputPath: WRITE_LOCAL_JSON ? inputPath : null,
      outputPath: WRITE_LOCAL_JSON ? outputPath : null,
    };
  });

  if (supabase) {
    await upsertFeedbackRun(supabase, {
      run_id: RUN_ID,
      generated_at: generatedAt,
      from_datetime: parseIsoOrNull(selected.filter?.fromDateTime),
      to_datetime: parseIsoOrNull(selected.filter?.toDateTime),
      calls_processed: 0,
      total_feedback_items: 0,
      status: "preparing",
    });
    await upsertFeedbackCalls(
      supabase,
      calls.map((call) => ({
        run_id: RUN_ID,
        call_id: call.callId,
        title: call.title ?? "",
        started: parseIsoOrNull(call.started),
        duration: Number.isFinite(Number(call.duration)) ? Number(call.duration) : null,
        gong_url: call.gongUrl ?? "",
        call_payload: call,
        shard_status: "pending",
      })),
    );
  }

  const manifest = {
    generatedAt,
    runId: RUN_ID,
    runDir: RUN_DIR,
    selectedCallsPath: SELECTED_CALLS_PATH,
    writeSupabase: WRITE_SUPABASE,
    writeLocalJson: WRITE_LOCAL_JSON,
    useProcessedCalls: USE_PROCESSED_CALLS,
    callLimit: CALL_LIMIT,
    callsToProcess: manifestCalls.length,
    calls: manifestCalls,
  };

  const manifestPath = resolve(RUN_DIR, "manifest.json");
  saveJson(manifestPath, manifest);
  console.error(`Prepared run manifest at ${manifestPath}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
