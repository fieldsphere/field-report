import { generateText, Output, gateway } from "ai";
import { z } from "zod";

const ThemeDraftSchema = z.object({
  label: z.string().min(1),
  summary: z.string().min(1),
  supportingKeys: z.array(z.string().min(1)).min(1),
  representativeQuote: z.string().optional().default(""),
  customerAccounts: z.array(z.string()).optional().default([]),
  topFeedbackTypes: z.array(z.string()).optional().default([]),
});

const ThemeAnalysisSchema = z.object({
  intro: z.string().min(1),
  buckets: z.array(ThemeDraftSchema).min(1),
});

const TYPE_WEIGHT = {
  "Bug Report": 1.2,
  Friction: 1.15,
  Complaint: 1.05,
  "Feature Request": 1,
  Other: 0.9,
  Praise: 0.5,
};

const CONFIDENCE_WEIGHT = {
  High: 1,
  Medium: 0.6,
  Low: 0.3,
};

const SYSTEM_PROMPT = `
You are a product analyst preparing a weekly summary of Cursor customer feedback.
Group related feedback rows into clear weekly buckets. Buckets should represent
repeatable themes, not one-off anecdotes.

Prioritization guidance:
- Frequency is the strongest signal.
- High-severity bugs and frictions should outrank low-impact requests.
- De-emphasize praise and weak/noisy signals unless they are very frequent.

Return:
- intro: 1-2 sentence weekly narrative.
- buckets: each bucket needs:
  - label: short theme title
  - summary: one actionable sentence
  - supportingKeys: list of row keys that belong to this bucket (must come from input)
  - representativeQuote: one short quote from the supporting rows
  - customerAccounts: optional list of customer names/accounts
  - topFeedbackTypes: optional list of top feedback types for this bucket
`.trim();

function parseScoreNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sortCountEntries(countMap) {
  return [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function uniqNonEmpty(values) {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function severityBreakdownForRows(rows) {
  const breakdown = { High: 0, Medium: 0, Low: 0 };
  for (const row of rows) {
    const severity = String(row.severity ?? "");
    if (severity in breakdown) breakdown[severity] += 1;
  }
  return breakdown;
}

function averageConfidence(rows) {
  if (!rows.length) return 0;
  const total = rows.reduce(
    (sum, row) => sum + (CONFIDENCE_WEIGHT[row.confidence] ?? 0),
    0,
  );
  return total / rows.length;
}

function typeCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(row.feedbackType ?? "Other");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function scoreTheme({ repeatCount, severityBreakdown, confidenceScore, typeMix }) {
  const high = severityBreakdown.High ?? 0;
  const medium = severityBreakdown.Medium ?? 0;
  const low = severityBreakdown.Low ?? 0;
  const severityScore = high * 6 + medium * 3 + low;
  const typeScore = typeMix * 2;
  const confidenceBoost = confidenceScore * 2;
  return repeatCount * 10 + severityScore + typeScore + confidenceBoost;
}

function pickRepresentativeQuote(theme, rows) {
  if (theme.representativeQuote?.trim()) return theme.representativeQuote.trim();
  const first = rows.find((row) => row.verbatimQuote?.trim());
  return first?.verbatimQuote?.trim() ?? "";
}

function serializeItemForPrompt(item, index) {
  return [
    `[${index + 1}]`,
    `key=${item.dedupeKey}`,
    `type=${item.feedbackType}`,
    `severity=${item.severity}`,
    `confidence=${item.confidence}`,
    `account=${item.customerAccount || "Unknown"}`,
    `summary=${item.summary}`,
    `quote="${item.verbatimQuote}"`,
  ].join(" | ");
}

function aggregateTheme(theme, itemByKey) {
  const rows = uniqNonEmpty(theme.supportingKeys)
    .map((key) => itemByKey.get(key))
    .filter(Boolean);
  if (!rows.length) return null;

  const severityBreakdown = severityBreakdownForRows(rows);
  const countsByType = typeCounts(rows);
  const sortedTypes = sortCountEntries(countsByType);
  const typeMix =
    rows.reduce((sum, row) => sum + (TYPE_WEIGHT[row.feedbackType] ?? TYPE_WEIGHT.Other), 0) /
    rows.length;
  const confidenceScore = averageConfidence(rows);
  const customerAccounts = uniqNonEmpty([
    ...rows.map((row) => row.customerAccount),
    ...(theme.customerAccounts ?? []),
  ]).slice(0, 5);
  const representativeQuote = pickRepresentativeQuote(theme, rows);
  const repeatCount = rows.length;

  return {
    label: theme.label.trim(),
    summary: theme.summary.trim(),
    repeatCount,
    severityBreakdown,
    topFeedbackTypes: uniqNonEmpty([...(theme.topFeedbackTypes ?? []), ...sortedTypes]).slice(
      0,
      3,
    ),
    representativeQuote,
    customerAccounts,
    supportingKeys: rows.map((row) => row.dedupeKey),
    score: scoreTheme({
      repeatCount,
      severityBreakdown,
      confidenceScore,
      typeMix,
    }),
  };
}

export function rankThemeBuckets({ buckets, items, topN = 5 }) {
  const topCount = Math.max(1, Number(topN) || 5);
  const itemByKey = new Map(items.map((item) => [item.dedupeKey, item]));
  const aggregated = buckets
    .map((theme) => aggregateTheme(theme, itemByKey))
    .filter(Boolean)
    .sort((a, b) => parseScoreNumber(b.score) - parseScoreNumber(a.score));
  return aggregated.slice(0, topCount).map((theme, index) => ({
    rank: index + 1,
    ...theme,
  }));
}

export async function analyzeRunThemes({
  runId,
  items,
  modelId,
  topN = 5,
  maxPromptItems = 500,
}) {
  if (!runId) throw new Error("runId is required for theme analysis.");
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cannot analyze themes without input items.");
  }

  const topCount = Math.max(1, Number(topN) || 5);
  const selectedItems = items.slice(0, Math.max(1, Number(maxPromptItems) || 500));
  const prompt = [
    `Run: ${runId}`,
    `Item count in prompt: ${selectedItems.length}`,
    "",
    ...selectedItems.map((item, i) => serializeItemForPrompt(item, i)),
  ].join("\n");

  const { output } = await generateText({
    model: gateway(modelId),
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: ThemeAnalysisSchema }),
    prompt,
  });

  const rankedThemes = rankThemeBuckets({
    buckets: output.buckets,
    items: selectedItems,
    topN: topCount,
  });

  return {
    runId,
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    analyzedItems: selectedItems.length,
    analyzedBuckets: output.buckets.length,
    intro: output.intro,
    themes: rankedThemes,
  };
}
