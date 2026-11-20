// Head manual ops events backed by public.head_ops_events.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { getTesterDisplayName } from "../utils/testerRegistry.js";

function mapRow(row) {
  const targets = Array.isArray(row.targets) ? row.targets : [];
  return {
    id: row.id,
    type: row.event_type,
    ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    message: row.message,
    sp: row.setpoints || {},
    targets,
    targetNames: targets.map((id) => getTesterDisplayName(id)).join(", "),
    mode: row.mode || "step",
    rampSeconds: row.ramp_seconds ?? 5,
  };
}

export async function fetchHeadOpsEvents() {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("head_ops_events")
    .select("id, event_type, message, setpoints, targets, mode, ramp_seconds, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.warn("[SENTINEX] head_ops_events load:", error);
    return [];
  }

  return (data || []).map(mapRow);
}

export async function createHeadOpsEvent({
  type,
  message,
  sp,
  targets = [],
  mode = "step",
  rampSeconds = 5,
}) {
  const session = loadAuthSession();
  if (!isSupabaseConfigured() || !session?.userId || session.role !== "head") {
    throw new Error("Head session required");
  }

  const payload = {
    created_by: session.userId,
    event_type: type,
    message,
    setpoints: sp || {},
    targets,
    mode,
    ramp_seconds: rampSeconds,
  };

  const { data, error } = await supabase
    .from("head_ops_events")
    .insert(payload)
    .select("id, event_type, message, setpoints, targets, mode, ramp_seconds, created_at")
    .single();

  if (error) {
    console.warn("[SENTINEX] head_ops_events insert:", error);
    throw new Error(error.message || "Could not create head ops event");
  }

  return mapRow(data);
}
