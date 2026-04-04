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

  for (const pick of digest.picks) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*${pick.rank}.* ${severityEmoji(pick.severity)} \`${typeTag(pick.feedbackType)}\` ${pick.summary}`,
          `>_"${pick.verbatimQuote}"_ — ${pick.customerAccount || "Unknown customer"}`,
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
