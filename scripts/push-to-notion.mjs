#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildNotionSyncPrompt } from "./lib/notion-sync-prompt.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const RUN_ID = process.env.RUN_ID?.trim() || "";
const MAX_ITEMS = Math.max(1, Number(process.env.MAX_ITEMS ?? "1000") || 1000);
const DRY_RUN = (process.env.DRY_RUN ?? "false") === "true";
const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID?.trim();
const NOTION_DATABASE_URL = process.env.NOTION_DATABASE_URL?.trim() || "";
const NOTION_DATA_SOURCE_URL = process.env.NOTION_DATA_SOURCE_URL?.trim() || "";

function main() {
  const prompt = buildNotionSyncPrompt({
    dryRun: DRY_RUN,
    maxItems: MAX_ITEMS,
    notionDatabaseUrl: NOTION_DATABASE_URL,
    notionDataSourceUrl: NOTION_DATA_SOURCE_URL,
    runId: RUN_ID,
    supabaseProjectId: SUPABASE_PROJECT_ID,
  });
  const result = spawnSync(
    "cursor-agent",
    [
      "--print",
      "--trust",
      "--approve-mcps",
      "--workspace",
      projectRoot,
      prompt,
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
