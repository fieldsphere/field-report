import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackBlocks,
  severityEmoji,
  typeTag,
} from "../scripts/lib/slack-digest.mjs";

test("severityEmoji maps severities to Slack emoji", () => {
  assert.equal(severityEmoji("High"), ":red_circle:");
  assert.equal(severityEmoji("Medium"), ":large_orange_circle:");
  assert.equal(severityEmoji("Low"), ":white_circle:");
});

test("typeTag falls back to a lower-cased value", () => {
  assert.equal(typeTag("Feature Request"), "feature");
  assert.equal(typeTag("Custom Signal"), "custom signal");
});

test("buildSlackBlocks includes ranked themes and notion link", () => {
  const blocks = buildSlackBlocks({
    digest: {
      intro: "Weekly themes are around cost visibility and MCP permissions.",
      themes: [
        {
          rank: 1,
          label: "Cost controls are unclear",
          summary: "Customers asked for clearer spend visibility and controls.",
          repeatCount: 4,
          severityBreakdown: { High: 2, Medium: 2, Low: 0 },
          topFeedbackTypes: ["Feature Request"],
          customerAccounts: [],
          representativeQuote: "We need per-session cost visibility.",
        },
      ],
    },
    itemCount: 6,
    notionDatabaseUrl: "https://www.notion.so/example",
    runId: "quick-smoke-20260403-1943",
  });

  assert.equal(blocks[0].type, "header");
  assert.match(
    blocks[3].text.text,
    /\*1\.\* :red_circle: `feature` \*Cost controls are unclear\* — Customers asked for clearer spend visibility and controls\./,
  );
  assert.match(blocks[3].text.text, /repeats: \*4\*/);
  assert.match(blocks[3].text.text, /severity: \*H:2 M:2 L:0\*/);
  assert.match(blocks[3].text.text, /Unknown customer/);
  assert.match(
    blocks[5].elements[0].text,
    /6 total items from run `quick-smoke-20260403-1943`/,
  );
  assert.match(blocks[5].elements[0].text, /View full database in Notion/);
});
