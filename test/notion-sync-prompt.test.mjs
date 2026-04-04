import assert from "node:assert/strict";
import test from "node:test";
import { buildNotionSyncPrompt } from "../scripts/lib/notion-sync-prompt.mjs";

test("buildNotionSyncPrompt includes required and optional values", () => {
  const prompt = buildNotionSyncPrompt({
    dryRun: true,
    maxItems: 25,
    notionDatabaseUrl: "https://www.notion.so/database",
    notionDataSourceUrl: "https://www.notion.so/data-source",
    runId: "quick-smoke-20260403-1943",
    supabaseProjectId: "ivbdhcmphazjqajprept",
  });

  assert.match(prompt, /RUN_ID=quick-smoke-20260403-1943/);
  assert.match(prompt, /MAX_ITEMS=25/);
  assert.match(prompt, /DRY_RUN=true/);
  assert.match(prompt, /SUPABASE_PROJECT_ID=ivbdhcmphazjqajprept/);
  assert.match(prompt, /NOTION_DATABASE_URL=https:\/\/www\.notion\.so\/database/);
  assert.match(prompt, /NOTION_DATA_SOURCE_URL=https:\/\/www\.notion\.so\/data-source/);
});

test("buildNotionSyncPrompt omits optional urls and defaults the run label", () => {
  const prompt = buildNotionSyncPrompt({
    supabaseProjectId: "ivbdhcmphazjqajprept",
  });

  assert.match(prompt, /RUN_ID=\(all pending runs\)/);
  assert.doesNotMatch(prompt, /NOTION_DATABASE_URL=/);
  assert.doesNotMatch(prompt, /NOTION_DATA_SOURCE_URL=/);
});

test("buildNotionSyncPrompt requires a Supabase project id", () => {
  assert.throws(
    () => buildNotionSyncPrompt({ supabaseProjectId: "" }),
    /Missing SUPABASE_PROJECT_ID/,
  );
});
