export function buildNotionSyncPrompt({
  dryRun = false,
  maxItems = 1000,
  notionDatabaseUrl = "",
  notionDataSourceUrl = "",
  runId = "",
  supabaseProjectId,
}) {
  if (!supabaseProjectId) {
    throw new Error(
      "Missing SUPABASE_PROJECT_ID. Set it in .env.local or environment.",
    );
  }

  const lines = [
    "Use MCP only to sync Gong feedback from Supabase to Notion.",
    "",
    "Follow the instructions in `.cursor/agents/gong-feedback-notion-sync-agent.md` exactly.",
    "Do not edit any files in the workspace.",
    "Do not run unrelated commands.",
    "Perform the sync and print a concise result summary.",
    "",
    `RUN_ID=${runId || "(all pending runs)"}`,
    `MAX_ITEMS=${maxItems}`,
    `DRY_RUN=${dryRun ? "true" : "false"}`,
    `SUPABASE_PROJECT_ID=${supabaseProjectId}`,
  ];

  if (notionDatabaseUrl) {
    lines.push(`NOTION_DATABASE_URL=${notionDatabaseUrl}`);
  }
  if (notionDataSourceUrl) {
    lines.push(`NOTION_DATA_SOURCE_URL=${notionDataSourceUrl}`);
  }

  return lines.join("\n");
}
