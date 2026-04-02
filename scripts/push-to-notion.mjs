#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const RUN_ID = process.env.RUN_ID?.trim() || "";
const MAX_ITEMS = Math.max(1, Number(process.env.MAX_ITEMS ?? "1000") || 1000);
const DRY_RUN = (process.env.DRY_RUN ?? "false") === "true";
const SUPABASE_PROJECT_ID =
  process.env.SUPABASE_PROJECT_ID?.trim() || "ivbdhcmphazjqajprept";
const NOTION_DATABASE_URL = process.env.NOTION_DATABASE_URL?.trim() || "";
const NOTION_DATA_SOURCE_URL = process.env.NOTION_DATA_SOURCE_URL?.trim() || "";

function buildPrompt() {
  const lines = [
    "Use MCP only to sync Gong feedback from Supabase to Notion.",
    "",
    "Follow the instructions in `.cursor/agents/gong-feedback-notion-sync-agent.md` exactly.",
    "Do not edit any files in the workspace.",
    "Do not run unrelated commands.",
    "Perform the sync and print a concise result summary.",
    "",
    `RUN_ID=${RUN_ID || "(all pending runs)"}`,
    `MAX_ITEMS=${MAX_ITEMS}`,
    `DRY_RUN=${DRY_RUN ? "true" : "false"}`,
    `SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}`,
  ];
  if (NOTION_DATABASE_URL) {
    lines.push(`NOTION_DATABASE_URL=${NOTION_DATABASE_URL}`);
  }
  if (NOTION_DATA_SOURCE_URL) {
    lines.push(`NOTION_DATA_SOURCE_URL=${NOTION_DATA_SOURCE_URL}`);
  }
  return lines.join("\n");
}

function main() {
  const result = spawnSync(
    "cursor-agent",
    [
      "--print",
      "--trust",
      "--approve-mcps",
      "--workspace",
      projectRoot,
      buildPrompt(),
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw new Error(
      `Failed to launch cursor-agent for Notion MCP sync: ${result.error.message}`,
    );
  }
  process.exit(result.status ?? 0);
}

try {
  main();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
