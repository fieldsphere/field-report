#!/usr/bin/env node

import dotenv from "dotenv";
import { Client } from "@notionhq/client";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? "";
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID ?? "";
const DATABASE_TITLE =
  process.env.NOTION_DATABASE_TITLE ?? "Gong Field Engineer Feedback";

async function main() {
  if (!NOTION_API_KEY) {
    throw new Error("Missing NOTION_API_KEY in environment.");
  }
  if (!NOTION_PARENT_PAGE_ID) {
    throw new Error("Missing NOTION_PARENT_PAGE_ID in environment.");
  }

  const notion = new Client({ auth: NOTION_API_KEY });
  const created = await notion.databases.create({
    parent: { type: "page_id", page_id: NOTION_PARENT_PAGE_ID },
    title: [{ type: "text", text: { content: DATABASE_TITLE } }],
    properties: {
      Summary: { title: {} },
      "Call Title": { rich_text: {} },
      "Call Date": { date: {} },
      "Gong URL": { url: {} },
      "Field Engineer": { rich_text: {} },
      "Customer / Account": { rich_text: {} },
      "Feedback Type": {
        select: {
          options: [
            { name: "Feature Request" },
            { name: "Bug Report" },
            { name: "Friction" },
            { name: "Complaint" },
            { name: "Praise" },
            { name: "Other" },
          ],
        },
      },
      Severity: {
        select: {
          options: [{ name: "High" }, { name: "Medium" }, { name: "Low" }],
        },
      },
      "Verbatim Quote": { rich_text: {} },
      "Evidence Speaker": { rich_text: {} },
      "Evidence Timestamp": { rich_text: {} },
      Confidence: {
        select: {
          options: [{ name: "High" }, { name: "Medium" }, { name: "Low" }],
        },
      },
      "Dedupe Key": { rich_text: {} },
    },
  });

  const out = {
    databaseId: created.id,
    databaseUrl: created.url,
    title: DATABASE_TITLE,
  };
  console.error(`Created Notion database ${created.id}`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
