#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { analyzeRunThemes } from "./lib/run-theme-analysis.mjs";
import {
  createSupabaseServiceClient,
  upsertFeedbackRunSummary,
  writeSupabaseEnabled,
} from "./lib/supabase.mjs";
import { saveJson } from "./lib/extract-feedback-core.mjs";

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

const MODEL_ID =
  process.env.ANALYZE_MODEL ??
  process.env.DISTILL_MODEL ??
  process.env.EXTRACT_MODEL ??
  "anthropic/claude-sonnet-4-20250514";
const TOP_N = Math.max(1, Number(process.env.ANALYZE_TOP_N ?? "5") || 5);
const MAX_PROMPT_ITEMS = Math.max(
  50,
  Number(process.env.ANALYZE_MAX_PROMPT_ITEMS ?? "500") || 500,
);
const OUTPUT_PATH =
  process.env.ANALYSIS_OUTPUT_PATH ?? resolve(dataDir, "runs", RUN_ID, "analysis.json");
const WRITE_SUPABASE = writeSupabaseEnabled();

function toAnalysisItem(row) {
  return {
    dedupeKey: row.dedupe_key,
    summary: row.summary ?? "",
    feedbackType: row.feedback_type ?? "Other",
    severity: row.severity ?? "Low",
    confidence: row.confidence ?? "Low",
    verbatimQuote: row.verbatim_quote ?? "",
    customerAccount: row.customer_account ?? "",
  };
}

async function loadRunItems(supabase) {
  const rows = [];
  const batchSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("feedback_items")
      .select(
        "dedupe_key, summary, feedback_type, severity, confidence, verbatim_quote, customer_account",
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
  return rows.map(toAnalysisItem);
}

async function main() {
  if (!WRITE_SUPABASE) {
    throw new Error("WRITE_SUPABASE must be true to analyze a run.");
  }
  const supabase = createSupabaseServiceClient();
  const items = await loadRunItems(supabase);
  if (items.length === 0) {
    throw new Error(`No feedback items found for run ${RUN_ID}.`);
  }

  console.error(`Loaded ${items.length} feedback items for run ${RUN_ID}.`);
  const analysis = await analyzeRunThemes({
    runId: RUN_ID,
    items,
    modelId: MODEL_ID,
    topN: TOP_N,
    maxPromptItems: MAX_PROMPT_ITEMS,
  });

  saveJson(OUTPUT_PATH, analysis);
  await upsertFeedbackRunSummary(supabase, {
    run_id: RUN_ID,
    generated_at: analysis.generatedAt,
    total_items: analysis.totalItems,
    top_n: analysis.themes.length,
    intro: analysis.intro,
    themes: analysis.themes,
  });

  console.error(
    `Saved weekly analysis to ${OUTPUT_PATH} and persisted ${analysis.themes.length} themes.`,
  );
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
