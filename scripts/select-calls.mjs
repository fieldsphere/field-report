#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const KEY = process.env.GONG_ACCESS_KEY;
const SECRET =
  process.env.GONG_ACCESS_SECRET ?? process.env.GONG_ACCESS_KEY_SECRET;
const DAYS = Math.max(1, Number(process.env.DAYS ?? "7") || 7);
const PARTY_TITLE_SUBSTRING = (
  process.env.PARTY_TITLE_SUBSTRING ?? "Field Engineer"
).trim();
const LIMIT_CALLS = Math.max(0, Number(process.env.LIMIT_CALLS ?? "0") || 0);
const OUTPUT_PATH =
  process.env.OUTPUT_PATH ?? resolve(repoRoot, "data", "selected-calls.json");
const FROM_DATETIME = process.env.FROM_DATETIME?.trim() || "";
const TO_DATETIME = process.env.TO_DATETIME?.trim() || "";
const DATE_WINDOW_MODE = (process.env.DATE_WINDOW_MODE ?? "calendar-sun-to-sun").trim();

function toSafeStamp(isoDate) {
  return String(isoDate).replace(/:/g, "-");
}

function archivePathFor(outputPath, generatedAt) {
  const ext = extname(outputPath) || ".json";
  const base = basename(outputPath, ext);
  const stamp = toSafeStamp(generatedAt);
  return resolve(dirname(outputPath), "history", base, `${stamp}${ext}`);
}

function previousCalendarWeekUtcSundayToSunday(now = new Date()) {
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayOfWeek = startOfTodayUtc.getUTCDay(); // 0 = Sunday
  const startOfCurrentWeek = new Date(
    startOfTodayUtc.getTime() - dayOfWeek * 24 * 60 * 60 * 1000,
  );
  const to = startOfCurrentWeek;
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function callsExtensiveUrl() {
  const apiV2 = process.env.GONG_API_BASE_URL?.replace(/\/$/, "");
  if (apiV2) return `${apiV2}/calls/extensive`;
  const base = (process.env.GONG_BASE_URL ?? "https://api.gong.io").replace(
    /\/$/,
    "",
  );
  return `${base}/v2/calls/extensive`;
}

function authHeader() {
  const token = Buffer.from(`${KEY}:${SECRET}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function getParties(call) {
  if (Array.isArray(call.parties)) return call.parties;
  return [];
}

function matchingParticipants(call, titleSubstring) {
  const s = titleSubstring.toLowerCase();
  return getParties(call)
    .filter((p) => (p.title ?? "").toLowerCase().includes(s))
    .map((p) => ({ name: p.name ?? "", title: p.title ?? "" }));
}

function summarizeCall(call, matched) {
  const meta = call.metaData ?? call.meta_data ?? {};
  return {
    callId: meta.id ?? call.id ?? "",
    title: meta.title ?? "",
    started: meta.started ?? "",
    duration: meta.duration ?? 0,
    gongUrl: meta.url ?? "",
    scope: meta.scope ?? "",
    parties: getParties(call).map((p) => ({
      name: p.name ?? "",
      title: p.title ?? "",
      affiliation: p.affiliation ?? "",
      speakerId: p.speakerId ?? p.speaker_id ?? "",
    })),
    matchedParticipants: matched,
  };
}

function extractCallsAndCursor(body) {
  const calls = body.calls ?? body.data ?? [];
  const cursor =
    body.records?.cursor ?? body.pagination?.cursor ?? body.cursor ?? null;
  return { calls, cursor };
}

async function fetchAllCalls(fromIso, toIso) {
  const all = [];
  let cursor = null;
  let page = 0;

  for (;;) {
    page += 1;
    const req = {
      filter: { fromDateTime: fromIso, toDateTime: toIso },
      contentSelector: { exposedFields: { parties: true } },
    };
    if (cursor) req.cursor = cursor;

    const res = await fetch(callsExtensiveUrl(), {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
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
      throw new Error(
        `Gong API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
      );
    }

    const { calls, cursor: next } = extractCallsAndCursor(json);
    all.push(...calls);
    if (!next) break;
    cursor = next;
    if (page > 5000) throw new Error("Stopped after 5000 pages (sanity limit)");
  }

  return all;
}

async function main() {
  if (!KEY || !SECRET) {
    throw new Error(
      "Missing GONG_ACCESS_KEY or GONG_ACCESS_SECRET/GONG_ACCESS_KEY_SECRET",
    );
  }

  let fromIso;
  let toIso;
  if (FROM_DATETIME || TO_DATETIME) {
    if (!FROM_DATETIME || !TO_DATETIME) {
      throw new Error("FROM_DATETIME and TO_DATETIME must both be set together.");
    }
    const from = new Date(FROM_DATETIME);
    const to = new Date(TO_DATETIME);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("FROM_DATETIME/TO_DATETIME must be valid ISO-8601 datetimes.");
    }
    if (from >= to) {
      throw new Error("FROM_DATETIME must be earlier than TO_DATETIME.");
    }
    fromIso = from.toISOString();
    toIso = to.toISOString();
  } else {
    if (DATE_WINDOW_MODE === "rolling-days") {
      const to = new Date();
      const from = new Date(to.getTime() - DAYS * 24 * 60 * 60 * 1000);
      fromIso = from.toISOString();
      toIso = to.toISOString();
    } else {
      const calendarWindow = previousCalendarWeekUtcSundayToSunday();
      fromIso = calendarWindow.fromIso;
      toIso = calendarWindow.toIso;
    }
  }

  console.error(
    `Selecting Gong calls from ${fromIso} to ${toIso}, title contains ${JSON.stringify(PARTY_TITLE_SUBSTRING)}...`,
  );

  const allCalls = await fetchAllCalls(fromIso, toIso);
  let matchedCalls = allCalls
    .map((call) => {
      const matched = matchingParticipants(call, PARTY_TITLE_SUBSTRING);
      if (matched.length === 0) return null;
      return summarizeCall(call, matched);
    })
    .filter(Boolean);

  if (LIMIT_CALLS > 0) {
    matchedCalls = matchedCalls.slice(0, LIMIT_CALLS);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    filter: {
      fromDateTime: fromIso,
      toDateTime: toIso,
      partyTitleSubstring: PARTY_TITLE_SUBSTRING,
      limitCalls: LIMIT_CALLS > 0 ? LIMIT_CALLS : null,
    },
    totalCalls: allCalls.length,
    matched: matchedCalls.length,
    calls: matchedCalls,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const archivedOutputPath = archivePathFor(OUTPUT_PATH, payload.generatedAt);
  mkdirSync(dirname(archivedOutputPath), { recursive: true });
  writeFileSync(archivedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(`Wrote ${matchedCalls.length} calls to ${OUTPUT_PATH}`);
  console.error(`Archived run snapshot to ${archivedOutputPath}`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
