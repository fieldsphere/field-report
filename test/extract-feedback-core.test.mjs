import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dedupeItems,
  feedbackDedupeKey,
  resolveCallById,
} from "../scripts/lib/extract-feedback-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("feedbackDedupeKey normalizes whitespace before hashing", () => {
  const a = feedbackDedupeKey("call-123", "Hello   world\nfrom customer");
  const b = feedbackDedupeKey("call-123", " Hello world from customer ");

  assert.equal(a, b);
});

test("dedupeItems keeps the longest quote for duplicate keys", () => {
  const items = [
    {
      dedupeKey: "call-123:abc12345",
      summary: "short",
      verbatimQuote: "Need pricing info",
    },
    {
      dedupeKey: "call-123:abc12345",
      summary: "long",
      verbatimQuote:
        "Need pricing info with per-session visibility so teams can self-regulate usage",
    },
    {
      dedupeKey: "call-123:def67890",
      summary: "unique",
      verbatimQuote: "CLI debugging is great",
    },
  ];

  const deduped = dedupeItems(items);

  assert.equal(deduped.length, 2);
  assert.equal(
    deduped.find((item) => item.dedupeKey === "call-123:abc12345")?.summary,
    "long",
  );
});

test("resolveCallById finds a call in the selected-calls sample", () => {
  const samplePath = resolve(
    __dirname,
    "..",
    "contracts",
    "samples",
    "selected-calls.sample.json",
  );
  const payload = JSON.parse(readFileSync(samplePath, "utf8"));

  const call = resolveCallById(payload, "8011697136804677923");

  assert.equal(call.title, "Cursor <> Certara - Model Selection 101");
  assert.equal(call.matchedParticipants[0].name, "Joseph Yang");
});
