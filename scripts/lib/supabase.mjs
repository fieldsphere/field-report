import { createClient } from "@supabase/supabase-js";

function parseBool(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() !== "false";
}

export function writeSupabaseEnabled() {
  return parseBool(process.env.WRITE_SUPABASE, true);
}

export function writeLocalJsonEnabled() {
  return parseBool(process.env.WRITE_LOCAL_JSON, false);
}

export function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY. Set both, or set WRITE_SUPABASE=false.",
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false },
  });
}

export async function upsertFeedbackRun(supabase, row) {
  const { error } = await supabase
    .from("feedback_runs")
    .upsert(row, { onConflict: "run_id" });
  if (error) throw new Error(`Failed to upsert feedback run ${row.run_id}: ${error.message}`);
}

export async function updateFeedbackRun(supabase, runId, fields) {
  const { error } = await supabase.from("feedback_runs").update(fields).eq("run_id", runId);
  if (error) throw new Error(`Failed to update feedback run ${runId}: ${error.message}`);
}

export async function upsertFeedbackCalls(supabase, rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("feedback_calls")
    .upsert(rows, { onConflict: "run_id,call_id" });
  if (error) throw new Error(`Failed to upsert feedback calls: ${error.message}`);
}

export async function updateFeedbackCall(supabase, runId, callId, fields) {
  const { error } = await supabase
    .from("feedback_calls")
    .update(fields)
    .eq("run_id", runId)
    .eq("call_id", callId);
  if (error) throw new Error(`Failed to update feedback call ${callId}: ${error.message}`);
}

export async function upsertFeedbackItems(supabase, rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("feedback_items")
    .upsert(rows, { onConflict: "dedupe_key" });
  if (error) throw new Error(`Failed to upsert feedback items: ${error.message}`);
}
