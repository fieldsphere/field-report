#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText, Output, gateway } from "ai";
import { z } from "zod";
import { buildSlackBlocks } from "./lib/slack-digest.mjs";
import {
  createSupabaseServiceClient,
  writeSupabaseEnabled,
} from "./lib/supabase.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RUN_ID = process.env.RUN_ID?.trim();
if (!RUN_ID) {
  throw new Error("RUN_ID is required. Set it in env or .env.local.");
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim();
const SLACK_TOP_N = Math.max(1, Number(process.env.SLACK_TOP_N ?? "5") || 5);
const MODEL_ID =
  process.env.DISTILL_MODEL ??
  process.env.EXTRACT_MODEL ??
  "anthropic/claude-sonnet-4-20250514";
const DRY_RUN = (process.env.DRY_RUN ?? "false") === "true";
const NOTION_DATABASE_URL = process.env.NOTION_DATABASE_URL?.trim() || "";

const DigestSchema = z.object({
  intro: z.string().describe("1-2 sentence narrative intro for the week"),
  picks: z.array(
    z.object({
      rank: z.number(),
      summary: z.string().describe("One-line actionable summary"),
      feedbackType: z.string(),
      severity: z.string(),
      customerAccount: z.string(),
      verbatimQuote: z.string().describe("Short representative quote"),
    }),
  ),
});

const SYSTEM_PROMPT = `
You are a product insights analyst at Cursor. You receive a batch of customer
feedback items extracted from Field Engineer calls and must distill the most
important, actionable items for the product team.

Pick the top ${SLACK_TOP_N} items. Rank by product impact — prioritize items that
are blocking adoption or represent high-frequency pain, then high-severity bugs
and high-confidence feature requests. De-emphasize praise and low-confidence items.

Return:
- intro: a 1-2 sentence narrative summary of the week's themes.
- picks: the top ${SLACK_TOP_N} items ranked 1-${SLACK_TOP_N}, each with a terse
  actionable summary, the feedback type, severity, customer account, and a short
  representative verbatim quote.
`.trim();

async function loadRunItems(supabase) {
  const rows = [];
  const batchSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("feedback_items")
      .select(
        "summary, feedback_type, severity, verbatim_quote, evidence_speaker, confidence, call_title, call_date, gong_url, field_engineer, customer_account",
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

async function distillTopItems(items) {
  const itemLines = items.map(
    (it, i) =>
      `[${i + 1}] ${it.feedback_type} | ${it.severity} | ${it.customer_account || "Unknown"} | ${it.summary} | Quote: "${it.verbatim_quote}"`,
  );

  const { output } = await generateText({
    model: gateway(MODEL_ID),
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: DigestSchema }),
    prompt: [
      `Run: ${RUN_ID}`,
      `Total items: ${items.length}`,
      "",
      ...itemLines,
    ].join("\n"),
  });

  return output;
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
  console.error(`Loaded ${items.length} items. Distilling top ${SLACK_TOP_N}...`);

  const digest = await distillTopItems(items);
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
    `Posted digest with ${digest.picks.length} items to Slack for run ${RUN_ID}.`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
