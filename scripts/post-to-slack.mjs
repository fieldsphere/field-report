#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildSlackBlocks } from "./lib/slack-digest.mjs";
import { analyzeRunThemes } from "./lib/run-theme-analysis.mjs";
import {
  createSupabaseServiceClient,
  upsertFeedbackRunSummary,
  writeSupabaseEnabled,
} from "./lib/supabase.mjs";
import { loadJson, saveJson } from "./lib/extract-feedback-core.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = resolve(projectRoot, "data");

const RUN_ID = process.env.RUN_ID?.trim();
if (!RUN_ID) {
  throw new Error("RUN_ID is required. Set it in env or .env.local.");
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim();
const SLACK_TOP_N = Math.max(1, Number(process.env.SLACK_TOP_N ?? "5") || 5);
const MODEL_ID =
  process.env.ANALYZE_MODEL ??
  process.env.DISTILL_MODEL ??
  process.env.EXTRACT_MODEL ??
  "anthropic/claude-sonnet-4-20250514";
const ANALYSIS_PATH =
  process.env.ANALYSIS_OUTPUT_PATH ?? resolve(dataDir, "runs", RUN_ID, "analysis.json");
const REUSE_ANALYSIS = (process.env.REUSE_ANALYSIS ?? "true") !== "false";
const DRY_RUN = (process.env.DRY_RUN ?? "false") === "true";
const NOTION_DATABASE_URL = process.env.NOTION_DATABASE_URL?.trim() || "";

async function loadRunItems(supabase) {
  const rows = [];
  const batchSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("feedback_items")
      .select(
        "dedupe_key, summary, feedback_type, severity, verbatim_quote, confidence, customer_account",
      )
      .eq("run_id", RUN_ID)
      .order("created_at", { ascending: true })
      .range(from, from + batchSize - 1);
    if (error) throw new Error(`Failed to load feedback items: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return rows;
}

function toAnalysisItem(item) {
  return {
    dedupeKey: item.dedupe_key,
    summary: item.summary ?? "",
    feedbackType: item.feedback_type ?? "Other",
    severity: item.severity ?? "Low",
    confidence: item.confidence ?? "Low",
    verbatimQuote: item.verbatim_quote ?? "",
    customerAccount: item.customer_account ?? "",
  };
}

async function loadOrCreateAnalysis(supabase, items) {
  if (REUSE_ANALYSIS && existsSync(ANALYSIS_PATH)) {
    const payload = loadJson(ANALYSIS_PATH);
    if (Array.isArray(payload?.themes) && payload.themes.length > 0) {
      return payload;
    }
    console.error("Existing analysis file missing themes; regenerating analysis.");
  }

  const analysis = await analyzeRunThemes({
    runId: RUN_ID,
    items: items.map(toAnalysisItem),
    modelId: MODEL_ID,
    topN: SLACK_TOP_N,
  });
  saveJson(ANALYSIS_PATH, analysis);
  await upsertFeedbackRunSummary(supabase, {
    run_id: RUN_ID,
    generated_at: analysis.generatedAt,
    total_items: analysis.totalItems,
    top_n: analysis.themes.length,
    intro: analysis.intro,
    themes: analysis.themes,
  });
  return analysis;
}

async function postToSlack(blocks) {
  if (!SLACK_WEBHOOK_URL) {
    throw new Error(
      "Missing SLACK_WEBHOOK_URL. Set it in .env.local or environment.",
    );
  }
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook ${res.status}: ${body}`);
  }
}

async function main() {
  if (!writeSupabaseEnabled()) {
    throw new Error("WRITE_SUPABASE must be true to read feedback items.");
  }
  const supabase = createSupabaseServiceClient();

  console.error(`Loading feedback items for run ${RUN_ID}...`);
  const items = await loadRunItems(supabase);
  if (items.length === 0) {
    console.error("No feedback items found for this run. Nothing to post.");
    return;
  }
  console.error(`Loaded ${items.length} items. Preparing top ${SLACK_TOP_N} weekly themes...`);

  const digest = await loadOrCreateAnalysis(supabase, items);
  const blocks = buildSlackBlocks({
    digest,
    itemCount: items.length,
    notionDatabaseUrl: NOTION_DATABASE_URL,
    runId: RUN_ID,
  });

  if (DRY_RUN) {
    console.error("DRY_RUN=true — printing Slack payload without posting.");
    console.log(JSON.stringify({ blocks }, null, 2));
    return;
  }

  await postToSlack(blocks);
  console.error(
    `Posted digest with ${digest.themes.length} themes to Slack for run ${RUN_ID}.`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
