#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  archivePathFor,
  extractForCall,
  loadJson,
  loadProcessedCalls,
  saveJson,
  saveProcessedCalls,
} from "./lib/extract-feedback-core.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = resolve(projectRoot, "data");

const SELECTED_CALLS_PATH =
  process.env.SELECTED_CALLS_PATH ?? resolve(dataDir, "selected-calls.json");
const OUTPUT_PATH = process.env.OUTPUT_PATH ?? resolve(dataDir, "feedback.json");
const PROCESSED_CALLS_PATH =
  process.env.PROCESSED_CALLS_PATH ?? resolve(dataDir, "processed-calls.json");
const MODEL_ID =
  process.env.EXTRACT_MODEL ?? "anthropic/claude-sonnet-4-20250514";
const parsedCallLimit = Number(process.env.CALL_LIMIT);
const CALL_LIMIT =
  Number.isFinite(parsedCallLimit) && parsedCallLimit > 0
    ? Math.floor(parsedCallLimit)
    : null;
const CHUNK_CHAR_LIMIT = Math.max(
  20000,
  Number(process.env.CHUNK_CHAR_LIMIT ?? "120000") || 120000,
);
const CHUNK_OVERLAP_CHARS = Math.max(
  1000,
  Number(process.env.CHUNK_OVERLAP_CHARS ?? "8000") || 8000,
);
const USE_PROCESSED_CALLS = (process.env.USE_PROCESSED_CALLS ?? "true") !== "false";
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

async function main() {
  if (!KEY || !SECRET) {
    throw new Error(
      "Missing Gong credentials. Set GONG_ACCESS_KEY and GONG_ACCESS_SECRET or GONG_ACCESS_KEY_SECRET.",
    );
  }
  if (!existsSync(SELECTED_CALLS_PATH)) {
    throw new Error(`Missing input file: ${SELECTED_CALLS_PATH}`);
  }

  const selected = loadJson(SELECTED_CALLS_PATH);
  const processed = loadProcessedCalls(PROCESSED_CALLS_PATH);
  const allUnprocessedCalls = (selected.calls ?? []).filter((call) =>
    USE_PROCESSED_CALLS ? !processed.has(call.callId) : true,
  );
  const calls = CALL_LIMIT ? allUnprocessedCalls.slice(0, CALL_LIMIT) : allUnprocessedCalls;

  if (calls.length === 0) {
    console.error("No calls to process.");
    const payload = {
      generatedAt: new Date().toISOString(),
      modelUsed: MODEL_ID,
      callsProcessed: 0,
      totalFeedbackItems: 0,
      items: [],
    };
    saveJson(OUTPUT_PATH, payload);
    const archivedOutputPath = archivePathFor(OUTPUT_PATH, payload.generatedAt);
    saveJson(archivedOutputPath, payload);
    console.error(`Archived run snapshot to ${archivedOutputPath}`);
    return;
  }

  const items = [];
  const config = extractorConfig();
  for (const call of calls) {
    console.error(`Processing call ${call.callId} (${call.title})...`);
    const callItems = await extractForCall(config, call);
    items.push(...callItems);
    processed.add(call.callId);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    modelUsed: MODEL_ID,
    callsProcessed: calls.length,
    totalFeedbackItems: items.length,
    items,
  };

  saveJson(OUTPUT_PATH, payload);
  const archivedOutputPath = archivePathFor(OUTPUT_PATH, payload.generatedAt);
  saveJson(archivedOutputPath, payload);
  if (USE_PROCESSED_CALLS) saveProcessedCalls(PROCESSED_CALLS_PATH, processed);
  console.error(`Wrote ${items.length} feedback items to ${OUTPUT_PATH}`);
  console.error(`Archived run snapshot to ${archivedOutputPath}`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
