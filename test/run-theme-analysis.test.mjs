import assert from "node:assert/strict";
import test from "node:test";
import { rankThemeBuckets } from "../scripts/lib/run-theme-analysis.mjs";

test("rankThemeBuckets prioritizes frequency and severity", () => {
  const items = [
    {
      dedupeKey: "a1",
      feedbackType: "Friction",
      severity: "High",
      confidence: "High",
      verbatimQuote: "MCP auth is confusing.",
      customerAccount: "Acme",
      summary: "MCP auth is confusing.",
    },
    {
      dedupeKey: "a2",
      feedbackType: "Friction",
      severity: "Medium",
      confidence: "High",
      verbatimQuote: "MCP setup takes too long.",
      customerAccount: "Acme",
      summary: "MCP setup takes too long.",
    },
    {
      dedupeKey: "a3",
      feedbackType: "Bug Report",
      severity: "High",
      confidence: "Medium",
      verbatimQuote: "Permissions reset unexpectedly.",
      customerAccount: "BetaCo",
      summary: "Permissions reset unexpectedly.",
    },
    {
      dedupeKey: "b1",
      feedbackType: "Feature Request",
      severity: "Low",
      confidence: "High",
      verbatimQuote: "Would like custom labels.",
      customerAccount: "Gamma",
      summary: "Would like custom labels.",
    },
  ];

  const ranked = rankThemeBuckets({
    items,
    topN: 2,
    buckets: [
      {
        label: "MCP setup pain",
        summary: "MCP setup and permissions are painful.",
        supportingKeys: ["a1", "a2", "a3"],
      },
      {
        label: "Labeling requests",
        summary: "Users want custom labels.",
        supportingKeys: ["b1"],
      },
    ],
  });

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].label, "MCP setup pain");
  assert.equal(ranked[0].repeatCount, 3);
  assert.equal(ranked[0].severityBreakdown.High, 2);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].label, "Labeling requests");
});

test("rankThemeBuckets drops buckets with no matching keys", () => {
  const ranked = rankThemeBuckets({
    topN: 5,
    items: [
      {
        dedupeKey: "k1",
        feedbackType: "Complaint",
        severity: "Medium",
        confidence: "Medium",
        verbatimQuote: "Billing was confusing.",
        customerAccount: "Delta",
        summary: "Billing was confusing.",
      },
    ],
    buckets: [
      {
        label: "missing",
        summary: "No valid keys.",
        supportingKeys: ["does-not-exist"],
      },
    ],
  });

  assert.equal(ranked.length, 0);
});
