#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  extractForCall,
  loadJson,
  resolveCallById,
  saveJson,
} from "./lib/extract-feedback-core.mjs";
import {
  createSupabaseServiceClient,
  updateFeedbackCall,
  updateFeedbackRun,
  upsertFeedbackItems,
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
const CALL_JSON_PATH = process.env.CALL_JSON_PATH?.trim() || "";
const CALL_ID = process.env.CALL_ID?.trim() || "";
const RUN_ID = process.env.RUN_ID?.trim() || "manual-run";
const WRITE_SUPABASE = writeSupabaseEnabled();
const WRITE_LOCAL_JSON = writeLocalJsonEnabled();
const OUTPUT_PATH =
  process.env.OUTPUT_PATH ??
  (CALL_ID
    ? resolve(dataDir, "runs", RUN_ID, "calls", `${CALL_ID}.json`)
    : resolve(dataDir, "runs", RUN_ID, "calls", "call-output.json"));
const MODEL_ID =
  process.env.EXTRACT_MODEL ?? "anthropic/claude-sonnet-4-20250514";
const CHUNK_CHAR_LIMIT = Math.max(
  20000,
  Number(process.env.CHUNK_CHAR_LIMIT ?? "120000") || 120000,
);
const CHUNK_OVERLAP_CHARS = Math.max(
  1000,
  Number(process.env.CHUNK_OVERLAP_CHARS ?? "8000") || 8000,
);

const KEY = process.env.GONG_ACCESS_KEY;
const SECRET = process.env.GONG_ACCESS_SECRET ?? process.env.GONG_ACCESS_KEY_SECRET;

function extractorConfig() {
  return {
    gongAccessKey: KEY,
    gongAccessSecret: SECRET,
    gongApiBaseUrl: process.env.GONG_API_BASE_URL,
    gongBaseUrl: process.env.GONG_BASE_URL,
    modelId: MODEL_ID,
    chunkCharLimit: CHUNK_CHAR_LIMIT,
    chunkOverlapChars: CHUNK_OVERLAP_CHARS,
  };
}

function parseIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function loadCallPayloadFromSupabase(supabase) {
  if (!CALL_ID) return null;
  const { data, error } = await supabase
    .from("feedback_calls")
    .select("call_payload")
    .eq("run_id", RUN_ID)
    .eq("call_id", CALL_ID)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load call payload from Supabase: ${error.message}`);
  }
  return data?.call_payload ?? null;
}

async function loadCallPayload(supabase) {
  if (CALL_JSON_PATH) {
    if (!existsSync(CALL_JSON_PATH)) {
      throw new Error(`CALL_JSON_PATH does not exist: ${CALL_JSON_PATH}`);
    }
    return loadJson(CALL_JSON_PATH);
  }

  if (!CALL_ID) {
    throw new Error("Set either CALL_JSON_PATH or CALL_ID.");
  }
  if (supabase) {
    const payload = await loadCallPayloadFromSupabase(supabase);
    if (payload) return payload;
  }
  if (!existsSync(SELECTED_CALLS_PATH)) {
    throw new Error(`Missing selected calls file: ${SELECTED_CALLS_PATH}`);
  }
  const selected = loadJson(SELECTED_CALLS_PATH);
  return resolveCallById(selected, CALL_ID);
}

async function main() {
  if (!KEY || !SECRET) {
    throw new Error(
      "Missing Gong credentials. Set GONG_ACCESS_KEY and GONG_ACCESS_SECRET or GONG_ACCESS_KEY_SECRET.",
    );
  }

  const supabase = WRITE_SUPABASE ? createSupabaseServiceClient() : null;
  const call = await loadCallPayload(supabase);
  if (!call.callId) {
    throw new Error("Call payload must include callId.");
  }

  if (supabase) {
    await updateFeedbackRun(supabase, RUN_ID, { status: "extracting" });
  }

  console.error(`Extracting one call: ${call.callId} (${call.title ?? "Untitled"})`);
  let items = [];
  try {
    items = await extractForCall(extractorConfig(), call);
  } catch (error) {
    if (supabase) {
      await updateFeedbackCall(supabase, RUN_ID, call.callId, {
        shard_status: "failed",
        shard_completed_at: new Date().toISOString(),
      });
      await updateFeedbackRun(supabase, RUN_ID, { status: "failed" });
    }
    throw error;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    modelUsed: MODEL_ID,
    runId: RUN_ID,
    callId: call.callId,
    totalFeedbackItems: items.length,
    items,
  };

  if (supabase) {
    await upsertFeedbackItems(
      supabase,
      items.map((item) => ({
        run_id: RUN_ID,
        call_id: call.callId,
        dedupe_key: item.dedupeKey,
        summary: item.summary ?? "",
        feedback_type: item.feedbackType ?? "Other",
        severity: item.severity ?? null,
        verbatim_quote: item.verbatimQuote ?? null,
        evidence_speaker: item.evidenceSpeaker ?? null,
        evidence_timestamp: item.evidenceTimestamp ?? null,
        confidence: item.confidence ?? null,
        call_title: item.callTitle ?? call.title ?? "",
        call_date: parseIsoOrNull(item.callDate ?? call.started),
        gong_url: item.gongUrl ?? call.gongUrl ?? "",
        field_engineer: item.fieldEngineer ?? "",
        customer_account: item.customerAccount ?? "",
      })),
    );
    await updateFeedbackCall(supabase, RUN_ID, call.callId, {
      shard_status: "complete",
      shard_completed_at: new Date().toISOString(),
    });
  }

  if (WRITE_LOCAL_JSON) {
    saveJson(OUTPUT_PATH, payload);
    console.error(`Wrote call shard to ${OUTPUT_PATH}`);
  } else {
    console.error(
      `Skipped local shard write because WRITE_LOCAL_JSON=false (call ${call.callId})`,
    );
  }
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
