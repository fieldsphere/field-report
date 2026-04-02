#!/usr/bin/env node
/**
 * Lists Gong calls from the last N days matching a filter (see MATCH).
 *
 * Default MATCH=party-title: at least one participant has a job title containing
 * PARTY_TITLE_SUBSTRING (default "Field Engineer"). Uses Gong call `parties[].title`.
 *
 * Other modes: MATCH=field (JSON key "engineer"), MATCH=text (any string has "engineer").
 *
 * Gong does not server-filter arbitrary participant titles on /v2/calls/extensive;
 * we page calls in the date range and filter locally.
 *
 * Auth: Basic base64(accessKey:accessKeySecret) per Gong API.
 * Env: GONG_ACCESS_KEY, GONG_ACCESS_SECRET or GONG_ACCESS_KEY_SECRET
 * Optional: GONG_API_BASE_URL, PARTY_TITLE_SUBSTRING, DAYS, MATCH
 *
 * Usage:
 *   node --env-file=gong-summary/.env gong-summary/scripts/list-calls-with-engineer-field.mjs
 *   PARTY_TITLE_SUBSTRING="Solutions Architect" node --env-file=gong-summary/.env ...
 */

import { Buffer } from "node:buffer";

const KEY = process.env.GONG_ACCESS_KEY;
const SECRET =
  process.env.GONG_ACCESS_SECRET ?? process.env.GONG_ACCESS_KEY_SECRET;

/** Full URL for POST .../calls/extensive */
function callsExtensiveUrl() {
  const apiV2 = process.env.GONG_API_BASE_URL?.replace(/\/$/, "");
  if (apiV2) {
    return `${apiV2}/calls/extensive`;
  }
  const base = (process.env.GONG_BASE_URL ?? "https://api.gong.io").replace(
    /\/$/,
    "",
  );
  return `${base}/v2/calls/extensive`;
}
const DAYS = Math.max(1, Number(process.env.DAYS ?? "7") || 7);
const MATCH = (process.env.MATCH ?? "party-title").toLowerCase();
const PARTY_TITLE_SUBSTRING = (
  process.env.PARTY_TITLE_SUBSTRING ?? "Field Engineer"
).trim();

function tryParseJsonObject(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function hasKeyNamedEngineer(value, depth = 0) {
  if (depth > 40) return false;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const parsed = tryParseJsonObject(value);
    return parsed !== null && hasKeyNamedEngineer(parsed, depth + 1);
  }
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasKeyNamedEngineer(item, depth + 1));
  }
  for (const [k, v] of Object.entries(value)) {
    if (k.toLowerCase() === "engineer") return true;
    if (hasKeyNamedEngineer(v, depth + 1)) return true;
  }
  return false;
}

function stringValuesMentionEngineer(value, depth = 0) {
  if (depth > 40) return false;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return /engineer/i.test(value);
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => stringValuesMentionEngineer(item, depth + 1));
  }
  return Object.values(value).some((v) => stringValuesMentionEngineer(v, depth + 1));
}

/** Gong extensive calls expose participants on `parties` (see Party.title). */
function getParties(call) {
  if (Array.isArray(call.parties)) return call.parties;
  const meta = call.metaData ?? call.meta_data;
  if (meta && Array.isArray(meta.parties)) return meta.parties;
  return [];
}

/**
 * Returns participants whose `title` contains `substring` (case-insensitive), or [].
 */
function participantsMatchingTitle(call, substring) {
  if (!substring) return [];
  const sub = substring.toLowerCase();
  const out = [];
  for (const p of getParties(call)) {
    const title = (p.title ?? "").trim();
    if (title && title.toLowerCase().includes(sub)) {
      out.push({
        name: (p.name ?? "").trim(),
        title,
      });
    }
  }
  return out;
}

function extractCallsAndCursor(body) {
  const calls = body.calls ?? body.data ?? [];
  const cursor =
    body.records?.cursor ??
    body.cursor ??
    body.pagination?.cursor ??
    null;
  return { calls, cursor };
}

function authHeader() {
  const token = Buffer.from(`${KEY}:${SECRET}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function fetchAllCallsExtensive(fromIso, toIso) {
  const all = [];
  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const body = {
      filter: {
        fromDateTime: fromIso,
        toDateTime: toIso,
      },
      contentSelector: {
        exposedFields: {
          parties: true,
        },
      },
    };
    if (cursor) body.cursor = cursor;

    const res = await fetch(callsExtensiveUrl(), {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 500)}`);
    }

    if (!res.ok) {
      const msg = json?.message ?? json?.error ?? text;
      throw new Error(`Gong API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }

    const { calls, cursor: next } = extractCallsAndCursor(json);
    all.push(...calls);
    if (!next) break;
    cursor = next;
    if (page > 5000) throw new Error("Stopped after 5000 pages (sanity limit)");
  }
  return all;
}

function pickSummary(call) {
  const meta = call.metaData ?? call.meta_data ?? {};
  const id = meta.id ?? call.id;
  const title = meta.title ?? "";
  const started = meta.started ?? "";
  const url = meta.url ?? "";
  return { id, title, started, url };
}

async function main() {
  if (!KEY || !SECRET) {
    console.error(
      "Missing GONG_ACCESS_KEY or GONG_ACCESS_SECRET / GONG_ACCESS_KEY_SECRET. Set them in the environment or use:\n" +
        "  node --env-file=gong-summary/.env gong-summary/scripts/list-calls-with-engineer-field.mjs",
    );
    process.exit(1);
  }

  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const modeLabel =
    MATCH === "party-title" || MATCH === "field-engineer"
      ? `party-title (substring: ${JSON.stringify(PARTY_TITLE_SUBSTRING)})`
      : MATCH;
  console.error(
    `Fetching calls from ${fromIso} to ${toIso} (${DAYS} day(s)), MATCH=${modeLabel}…`,
  );

  const calls = await fetchAllCallsExtensive(fromIso, toIso);

  const isPartyTitleMode =
    MATCH === "party-title" || MATCH === "field-engineer";

  let rows;
  if (isPartyTitleMode) {
    rows = calls
      .map((c) => {
        const participants = participantsMatchingTitle(c, PARTY_TITLE_SUBSTRING);
        if (participants.length === 0) return null;
        return {
          ...pickSummary(c),
          participantsWithMatchingTitle: participants,
        };
      })
      .filter(Boolean);
  } else {
    const matcher =
      MATCH === "text" ? stringValuesMentionEngineer : hasKeyNamedEngineer;
    rows = calls.filter((c) => matcher(c)).map(pickSummary);
  }

  console.log(
    JSON.stringify(
      {
        totalCalls: calls.length,
        matched: rows.length,
        matchMode: isPartyTitleMode ? "party-title" : MATCH,
        partyTitleSubstring: isPartyTitleMode ? PARTY_TITLE_SUBSTRING : undefined,
        calls: rows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
