#!/usr/bin/env node
/**
 * Creates a Notion page under NOTION_PARENT_PAGE_ID (or NOTION_PLUGIN_REQUEST_PARENT_PAGE_ID)
 * with the plug-in request markdown: intro as paragraphs, main section as markdown code blocks.
 *
 * Usage:
 *   node scripts/publish-plugin-request-to-notion.mjs [--title "Page title"] [path/to/file.md]
 *
 * Title: NOTION_PAGE_TITLE env, or --title "...", else the markdown H1.
 *
 * Requires: NOTION_API_KEY, NOTION_PARENT_PAGE_ID (see .env / .env.local)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(projectRoot, ".env.local"), quiet: true });
dotenv.config({ path: resolve(projectRoot, ".env"), quiet: true });

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? "";
const PARENT_PAGE_ID =
  process.env.NOTION_PLUGIN_REQUEST_PARENT_PAGE_ID ??
  process.env.NOTION_PARENT_PAGE_ID ??
  "";

const RICH_TEXT_MAX = 2000;

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_MAX) {
    chunks.push(text.slice(i, i + RICH_TEXT_MAX));
  }
  return chunks.length ? chunks : [""];
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function codeMarkdownBlock(text) {
  return {
    object: "block",
    type: "code",
    code: {
      rich_text: chunkText(text).map((c) => ({
        type: "text",
        text: { content: c },
      })),
      language: "markdown",
    },
  };
}

function parseMarkdownSections(md) {
  const lines = md.split("\n");
  const titleLine = (lines[0] ?? "").replace(/^#\s+/, "").trim() || "Feedback — plug-in request";
  const introLines = [];
  let i = 1;
  while (i < lines.length && lines[i] !== "---") {
    introLines.push(lines[i]);
    i++;
  }
  const intro = introLines.join("\n").trim();
  while (i < lines.length && (lines[i] === "---" || lines[i].trim() === "")) {
    i++;
  }
  const body = lines.slice(i).join("\n").trim();
  return { titleLine, intro, body };
}

function parseCli() {
  let customTitle = process.env.NOTION_PAGE_TITLE ?? "";
  let mdArg = null;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--title" && process.argv[i + 1]) {
      customTitle = process.argv[++i];
    } else if (a.startsWith("--title=")) {
      customTitle = a.slice("--title=".length);
    } else if (!a.startsWith("-")) {
      mdArg = a;
    }
  }
  return { customTitle: customTitle.trim(), mdArg };
}

async function main() {
  const defaultMd = resolve(
    projectRoot,
    "data/history/feedback/2026-03-30T21-04-19.260Z-plugin-request.md",
  );
  const { customTitle, mdArg } = parseCli();
  const mdPath = resolve(projectRoot, mdArg ?? defaultMd);
  const md = readFileSync(mdPath, "utf8");

  if (!NOTION_API_KEY) {
    throw new Error("Missing NOTION_API_KEY (set in .env or .env.local).");
  }
  if (!PARENT_PAGE_ID) {
    throw new Error(
      "Missing NOTION_PARENT_PAGE_ID or NOTION_PLUGIN_REQUEST_PARENT_PAGE_ID.",
    );
  }

  const { titleLine: mdTitle, intro, body } = parseMarkdownSections(md);
  const pageTitle = customTitle || mdTitle;
  const children = [];

  for (const para of intro.split(/\n\n+/).filter((p) => p.trim())) {
    for (const chunk of chunkText(para.trim())) {
      children.push(paragraphBlock(chunk));
    }
  }

  children.push({
    object: "block",
    type: "divider",
    divider: {},
  });

  if (body) {
    children.push(codeMarkdownBlock(body));
  }

  const notion = new Client({ auth: NOTION_API_KEY });

  const first = children.slice(0, 100);
  const page = await notion.pages.create({
    parent: { type: "page_id", page_id: PARENT_PAGE_ID },
    properties: {
      title: {
        title: [{ type: "text", text: { content: pageTitle } }],
      },
    },
    children: first,
  });

  let rest = children.slice(100);
  while (rest.length > 0) {
    const batch = rest.slice(0, 100);
    await notion.blocks.children.append({
      block_id: page.id,
      children: batch,
    });
    rest = rest.slice(100);
  }

  const idNoHyphens = page.id.replace(/-/g, "");
  const url = `https://www.notion.so/${idNoHyphens}`;
  console.error(`Created Notion page: ${url}`);
  console.log(url);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
