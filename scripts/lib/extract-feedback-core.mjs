import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { generateText, Output, gateway } from "ai";
import { z } from "zod";

export function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCursorTitle(title) {
  return typeof title === "string" && /\bcursor\b/i.test(title);
}

function isInternalAffiliation(affiliation) {
  return typeof affiliation === "string" && /\binternal\b/i.test(affiliation);
}

function normalizeNameKey(name) {
  return normalizeWhitespace(name).toLowerCase();
}

export function feedbackDedupeKey(callId, quote) {
  const normalized = normalizeWhitespace(quote).toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `${callId}:${hash}`;
}

function formatTimestampMs(ms) {
  if (Number.isNaN(ms) || ms === null || ms === undefined) return "";
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function inferCustomerAccount(title) {
  if (!title) return "";
  const separators = ["//", "<>", "|", ":"];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const [lhs] = title.split(sep);
      return normalizeWhitespace(lhs.replace(/Cursor/gi, "").replace(/-/g, " "));
    }
  }
  return normalizeWhitespace(title.replace(/Cursor/gi, ""));
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function saveJson(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function toSafeStamp(isoDate) {
  return String(isoDate).replace(/:/g, "-");
}

export function archivePathFor(outputPath, generatedAt) {
  const ext = extname(outputPath) || ".json";
  const base = basename(outputPath, ext);
  const stamp = toSafeStamp(generatedAt);
  return resolve(dirname(outputPath), "history", base, `${stamp}${ext}`);
}

export function loadProcessedCalls(path) {
  if (!existsSync(path)) return new Set();
  const data = loadJson(path);
  const ids = Array.isArray(data.callIds) ? data.callIds : [];
  return new Set(ids);
}

export function saveProcessedCalls(path, idsSet) {
  const payload = {
    updatedAt: new Date().toISOString(),
    callIds: [...idsSet].sort(),
  };
  saveJson(path, payload);
}

function transcriptUrl(config) {
  const apiV2 = config.gongApiBaseUrl?.replace(/\/$/, "");
  if (apiV2) return `${apiV2}/calls/transcript`;
  const base = (config.gongBaseUrl ?? "https://api.gong.io").replace(/\/$/, "");
  return `${base}/v2/calls/transcript`;
}

function authHeader(config) {
  const token = Buffer.from(
    `${config.gongAccessKey}:${config.gongAccessSecret}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

async function fetchTranscript(config, callId) {
  const res = await fetch(transcriptUrl(config), {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filter: { callIds: [callId] } }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Transcript non-JSON (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? text;
    throw new Error(
      `Gong transcript API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
    );
  }
  const arr = json.callTranscripts ?? json.transcripts ?? json.data ?? [];
  const record = arr.find((r) => r.callId === callId) ?? arr[0];
  if (!record) return [];
  return record.transcript ?? [];
}

function buildTranscriptText(transcript, speakerMap, excludedSpeakerIds = new Set()) {
  const lines = [];
  for (const block of transcript) {
    if (excludedSpeakerIds.has(block.speakerId)) continue;
    const speaker = speakerMap.get(block.speakerId) ?? block.speakerId ?? "Unknown";
    const sentences = Array.isArray(block.sentences) ? block.sentences : [];
    for (const sentence of sentences) {
      const ts = formatTimestampMs(sentence.start);
      const text = normalizeWhitespace(sentence.text);
      if (!text) continue;
      lines.push(`[${ts}] ${speaker}: ${text}`);
    }
  }
  return lines.join("\n");
}

function chunkText(text, chunkSize, overlap) {
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + chunkSize);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

const ExtractedItemSchema = z.object({
  feedbackType: z.enum([
    "Feature Request",
    "Bug Report",
    "Friction",
    "Complaint",
    "Praise",
    "Other",
  ]),
  summary: z.string().min(1),
  verbatimQuote: z.string().min(1),
  severity: z.enum(["High", "Medium", "Low"]),
  evidenceSpeaker: z.string().default(""),
  evidenceTimestamp: z.string().default(""),
  confidence: z.enum(["High", "Medium", "Low"]),
});

const LlmOutputSchema = z.object({
  items: z.array(ExtractedItemSchema),
});

const SYSTEM_PROMPT = `
You analyze sales and technical call transcripts.
Extract actionable feedback about the Cursor product (the editor, AI features, models, rules, MCP, integrations, billing in-product, docs only when framed as product feedback).

Feedback taxonomy:
- Feature Request: asks for a missing capability in Cursor
- Bug Report: Cursor behavior is broken or incorrect
- Friction: confusion, onboarding pain, awkward workflow in Cursor
- Complaint: explicit dissatisfaction or escalation about Cursor
- Praise: explicit positive signal about Cursor product value (features, UX, reliability)
- Other: useful Cursor product feedback that does not fit above

Do NOT extract (return items: [] for these):
- Issues about third-party tools or environments (Zoom, Teams, calendar apps, OS notifications, email, VPN) unless the customer is clearly asking for a change inside Cursor or a Cursor integration.
- Meeting logistics: sharing slides/decks "for reference," agendas, scheduling, generic "send the materials" with no product tie to Cursor.
- Generic praise of the session, kickoff, POC, workshop, or facilitation ("great session," "valuable kickoff," "thanks for the context," "appreciate the engagement") unless the same quote ties to a concrete Cursor product experience.

Rules:
- Return only substantive Cursor product feedback; when nothing qualifies, return items: [].
- Extract feedback from customer/external speakers only.
- Never extract statements made by Cursor employees/internal speakers.
- Include a concise summary.
- Include a verbatim quote for evidence.
- Include best-effort speaker and timestamp if available.
`.trim();

async function extractFromChunk(config, call, transcriptChunk, speakerConstraints) {
  const fieldEngineer =
    call.matchedParticipants?.map((p) => p.name).filter(Boolean).join(", ") ?? "";
  const customerAccount = inferCustomerAccount(call.title);
  const customerSpeakers = [...speakerConstraints.allowedSpeakerNames]
    .filter(Boolean)
    .join(", ");
  const internalSpeakers = [...speakerConstraints.excludedSpeakerNames]
    .filter(Boolean)
    .join(", ");

  const { output } = await generateText({
    model: gateway(config.modelId),
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: LlmOutputSchema }),
    prompt: [
      `Call ID: ${call.callId}`,
      `Call Title: ${call.title}`,
      `Call Date: ${call.started}`,
      `Field Engineer(s): ${fieldEngineer}`,
      `Customer/Account (best effort): ${customerAccount}`,
      `Customer speakers (allowed evidence): ${customerSpeakers || "Unknown"}`,
      `Internal Cursor speakers (exclude): ${internalSpeakers || "Unknown"}`,
      "",
      "Transcript:",
      transcriptChunk,
    ].join("\n"),
  });

  return output.items.map((item) => ({
    callId: call.callId,
    callTitle: call.title,
    callDate: call.started ? String(call.started).slice(0, 10) : "",
    gongUrl: call.gongUrl ?? "",
    fieldEngineer,
    customerAccount,
    feedbackType: item.feedbackType,
    summary: normalizeWhitespace(item.summary),
    verbatimQuote: normalizeWhitespace(item.verbatimQuote),
    severity: item.severity,
    evidenceSpeaker: normalizeWhitespace(item.evidenceSpeaker),
    evidenceTimestamp: normalizeWhitespace(item.evidenceTimestamp),
    confidence: item.confidence,
    dedupeKey: feedbackDedupeKey(call.callId, item.verbatimQuote),
  }));
}

export function dedupeItems(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.verbatimQuote) continue;
    if (!map.has(item.dedupeKey)) {
      map.set(item.dedupeKey, item);
      continue;
    }
    const existing = map.get(item.dedupeKey);
    if (item.verbatimQuote.length > existing.verbatimQuote.length) {
      map.set(item.dedupeKey, item);
    }
  }
  return [...map.values()];
}

export function resolveCallById(selectedCallsPayload, callId) {
  const call = (selectedCallsPayload.calls ?? []).find((c) => c.callId === callId);
  if (!call) throw new Error(`Call ${callId} not found in selected calls payload.`);
  return call;
}

export async function extractForCall(config, call, logger = console.error) {
  const matchedParticipantNames = new Set(
    (call.matchedParticipants ?? [])
      .map((p) => normalizeNameKey(p.name))
      .filter(Boolean),
  );
  const internalParties = (call.parties ?? []).filter(
    (p) =>
      isInternalAffiliation(p.affiliation) ||
      isCursorTitle(p.title) ||
      matchedParticipantNames.has(normalizeNameKey(p.name)),
  );
  const excludedSpeakerIds = new Set(
    internalParties.map((p) => p.speakerId).filter(Boolean),
  );
  const excludedSpeakerNames = new Set(
    [
      ...internalParties.map((p) => normalizeNameKey(p.name)).filter(Boolean),
      ...matchedParticipantNames,
    ].filter(Boolean),
  );
  const allowedSpeakerNames = new Set(
    (call.parties ?? [])
      .filter((p) => {
        const nameKey = normalizeNameKey(p.name);
        return (
          nameKey &&
          !excludedSpeakerNames.has(nameKey) &&
          !excludedSpeakerIds.has(p.speakerId)
        );
      })
      .map((p) => normalizeNameKey(p.name))
      .filter(Boolean),
  );
  const speakerMap = new Map(
    (call.parties ?? []).map((p) => [p.speakerId, p.name ?? p.speakerId]),
  );
  const transcript = await fetchTranscript(config, call.callId);
  if (!transcript.length) return [];

  const transcriptText = buildTranscriptText(transcript, speakerMap, excludedSpeakerIds);
  if (!transcriptText) return [];
  const chunks = chunkText(
    transcriptText,
    config.chunkCharLimit,
    config.chunkOverlapChars,
  );

  const allChunkItems = [];
  for (let i = 0; i < chunks.length; i += 1) {
    logger(`Extracting feedback for call ${call.callId} chunk ${i + 1}/${chunks.length}...`);
    const chunkItems = await extractFromChunk(config, call, chunks[i], {
      allowedSpeakerNames,
      excludedSpeakerNames,
    });
    allChunkItems.push(...chunkItems);
  }

  return dedupeItems(allChunkItems).filter((item) => {
    const evidenceSpeaker = normalizeNameKey(item.evidenceSpeaker);
    if (!evidenceSpeaker) return false;
    if (excludedSpeakerNames.has(evidenceSpeaker)) return false;
    if (allowedSpeakerNames.size > 0 && !allowedSpeakerNames.has(evidenceSpeaker)) {
      return false;
    }
    return true;
  });
}
