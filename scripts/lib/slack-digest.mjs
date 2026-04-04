export function severityEmoji(severity) {
  if (severity === "High") return ":red_circle:";
  if (severity === "Medium") return ":large_orange_circle:";
  return ":white_circle:";
}

export function typeTag(feedbackType) {
  const tags = {
    "Feature Request": "feature",
    "Bug Report": "bug",
    Friction: "friction",
    Complaint: "complaint",
    Praise: "praise",
    Other: "other",
  };
  return tags[feedbackType] ?? String(feedbackType ?? "other").toLowerCase();
}

function severityLabel(severityBreakdown = {}) {
  const high = Number(severityBreakdown.High ?? 0);
  const medium = Number(severityBreakdown.Medium ?? 0);
  const low = Number(severityBreakdown.Low ?? 0);
  return `H:${high} M:${medium} L:${low}`;
}

function dominantSeverity(severityBreakdown = {}) {
  const high = Number(severityBreakdown.High ?? 0);
  const medium = Number(severityBreakdown.Medium ?? 0);
  if (high > 0) return "High";
  if (medium > 0) return "Medium";
  return "Low";
}

export function buildSlackBlocks({
  digest,
  itemCount,
  notionDatabaseUrl = "",
  runId,
}) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: ":memo: Field Report Weekly Digest" },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: digest.intro },
    },
    { type: "divider" },
  ];

  for (const theme of digest.themes ?? []) {
    const primaryType = theme.topFeedbackTypes?.[0] ?? "Other";
    const topAccounts = (theme.customerAccounts ?? []).slice(0, 3);
    const accountLabel =
      topAccounts.length > 0 ? topAccounts.join(", ") : "Unknown customer";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*${theme.rank}.* ${severityEmoji(dominantSeverity(theme.severityBreakdown))} \`${typeTag(primaryType)}\` *${theme.label}* — ${theme.summary}`,
          `• repeats: *${theme.repeatCount}*  • severity: *${severityLabel(theme.severityBreakdown)}*`,
          `>_"${theme.representativeQuote}"_ — ${accountLabel}`,
        ].join("\n"),
      },
    });
  }

  blocks.push({ type: "divider" });

  const contextParts = [`${itemCount} total items from run \`${runId}\``];
  if (notionDatabaseUrl) {
    contextParts.push(`<${notionDatabaseUrl}|View full database in Notion>`);
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: contextParts.join("  ·  ") }],
  });

  return blocks;
}
