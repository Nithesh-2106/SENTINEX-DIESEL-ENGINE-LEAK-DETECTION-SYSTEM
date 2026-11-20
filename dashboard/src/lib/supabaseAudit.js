// Audit trail backed by public.audit_events.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { getTesterBayId, isHeadRole } from "../utils/testerRegistry.js";

function mapRow(row, profilesById = {}) {
  const profile = row.profile_id ? profilesById[row.profile_id] : null;
  const sessionKey = profile?.role === "head" ? "head" : profile?.username || null;
  return {
    id: row.id,
    ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    type: row.event_type,
    message: row.message,
    role: sessionKey,
    displayName: profile?.display_name || profile?.username || sessionKey || "—",
    meta: row.meta || {},
    bayId: row.bay_id,
  };
}

export async function fetchAuditEvents() {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("audit_events")
    .select("id, profile_id, bay_id, event_type, message, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    console.warn("[SENTINEX] audit_events load:", error);
    return [];
  }

  const profileIds = [...new Set((data || []).map((r) => r.profile_id).filter(Boolean))];
  const profilesById = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, role")
      .in("id", profileIds);
    (profiles || []).forEach((p) => {
      profilesById[p.id] = p;
    });
  }

  return (data || []).map((row) => mapRow(row, profilesById));
}

export async function insertAuditEvent({ type, message, meta = {}, role = null, bayId = null }) {
  const session = loadAuthSession();
  if (!isSupabaseConfigured() || !session?.userId) return null;

  const payload = {
    profile_id: session.userId,
    bay_id: bayId || (isHeadRole(role || session.role) ? null : getTesterBayId(role || session.sessionKey)),
    event_type: type,
    message,
    meta,
  };

  const { data, error } = await supabase
    .from("audit_events")
    .insert(payload)
    .select("id, profile_id, bay_id, event_type, message, meta, created_at")
    .single();

  if (error) {
    console.warn("[SENTINEX] audit_events insert:", error);
    return null;
  }

  return mapRow(data, {
    [session.userId]: {
      id: session.userId,
      username: session.username,
      display_name: session.displayName,
      role: session.role,
    },
  });
}

/** Map audit row to legacy audit panel shape. */
export function toLegacyAuditEvent(row) {
  return {
    id: row.id,
    ts: row.ts,
    type: row.type,
    message: row.message,
  };
}

/** Map audit row to cell activity feed shape. */
export function toCellActivity(row) {
  return {
    id: row.id,
    ts: row.ts,
    role: row.role,
    displayName: row.displayName,
    type: row.type,
    message: row.message,
    meta: row.meta,
  };
}
