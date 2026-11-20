// Change request persistence backed by the public.change_requests table.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

function mapRowToRequest(row, profilesById = {}) {
  if (!row) return null;
  const from = row.from_setpoints || {};
  const to = row.to_setpoints || {};
  const requestedByProfile = profilesById[row.requested_by] || null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    decidedAt: row.decided_at ? new Date(row.decided_at).getTime() : null,
    decidedBy: row.decided_by === row.requested_by ? row.requested_by : "head",
    requestedBy: requestedByProfile?.username || row.requested_by,
    requestedByName: requestedByProfile?.display_name || requestedByProfile?.username || row.requested_by,
    reason: row.reason || "",
    mode: row.mode || "step",
    rampSeconds: row.ramp_seconds ?? 5,
    rejectionReason: row.rejection_reason || "",
    bayId: row.bay_id,
    sessionId: row.session_id,
    from: {
      rpm: Number(from.rpm ?? 1800),
      load: Number(from.load ?? 75),
      p: Number(from.p ?? from.ambientPressure ?? 101.3),
    },
    to: {
      rpm: Number(to.rpm ?? 1800),
      load: Number(to.load ?? 75),
      p: Number(to.p ?? to.ambientPressure ?? 101.3),
    },
  };
}

export async function fetchChangeRequests() {
  if (!isSupabaseConfigured()) return [];
  const session = loadAuthSession();
  if (!session?.userId) return [];

  const { data, error } = await supabase
    .from("change_requests")
    .select(`
      id,
      bay_id,
      session_id,
      requested_by,
      status,
      reason,
      mode,
      ramp_seconds,
      from_setpoints,
      to_setpoints,
      decided_by,
      decided_at,
      rejection_reason,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.warn("[SENTINEX] change_requests load:", error);
    return [];
  }

  const requestedByIds = [...new Set((data || []).map((row) => row.requested_by).filter(Boolean))];
  const profilesById = {};
  if (requestedByIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", requestedByIds);
    (profiles || []).forEach((profile) => {
      profilesById[profile.id] = profile;
    });
  }

  return (data || []).map((row) => mapRowToRequest(row, profilesById)).filter(Boolean);
}

export async function createChangeRequest({
  reason,
  mode,
  rampSeconds,
  from,
  to,
  sessionId = null,
}) {
  const session = loadAuthSession();
  if (!isSupabaseConfigured() || !session?.userId || !session?.bayId) {
    throw new Error("Supabase session unavailable");
  }

  const payload = {
    bay_id: session.bayId,
    session_id: sessionId,
    requested_by: session.userId,
    reason: reason || null,
    mode: mode || "step",
    ramp_seconds: Number(rampSeconds ?? 5),
    from_setpoints: from || {},
    to_setpoints: to || {},
  };

  const { data, error } = await supabase
    .from("change_requests")
    .insert(payload)
    .select(`
      id,
      bay_id,
      session_id,
      requested_by,
      status,
      reason,
      mode,
      ramp_seconds,
      from_setpoints,
      to_setpoints,
      decided_by,
      decided_at,
      rejection_reason,
      created_at
    `)
    .single();

  if (error) {
    console.warn("[SENTINEX] change_requests create:", error);
    throw new Error(error.message || "Could not create request");
  }

  return mapRowToRequest(data, {
    [session.userId]: {
      id: session.userId,
      username: session.username,
      display_name: session.displayName,
    },
  });
}

export async function decideChangeRequest(id, { status, rejectionReason = null }) {
  if (!isSupabaseConfigured() || !id) {
    throw new Error("Supabase session unavailable");
  }

  const patch = {
    status,
    decided_at: new Date().toISOString(),
    rejection_reason: rejectionReason || null,
  };

  const { data, error } = await supabase
    .from("change_requests")
    .update(patch)
    .eq("id", id)
    .select(`
      id,
      bay_id,
      session_id,
      requested_by,
      status,
      reason,
      mode,
      ramp_seconds,
      from_setpoints,
      to_setpoints,
      decided_by,
      decided_at,
      rejection_reason,
      created_at
    `)
    .single();

  if (error) {
    console.warn("[SENTINEX] change_requests decide:", error);
    throw new Error(error.message || "Could not update request");
  }

  return mapRowToRequest(data);
}
