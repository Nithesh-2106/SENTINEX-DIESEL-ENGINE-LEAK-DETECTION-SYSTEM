/** Pure cell-sync timing + snapshot staleness (no browser / Supabase deps). */
export const SNAPSHOT_LIVE_MS = 5000;
export const PRESENCE_STALE_MS = 45000;

export function isSnapshotFresh(snap, maxAgeMs = SNAPSHOT_LIVE_MS) {
  if (!snap?.updatedAt) return false;
  return Date.now() - snap.updatedAt < maxAgeMs;
}

export function decayStaleSnapshot(snap, maxAgeMs = PRESENCE_STALE_MS) {
  if (!snap) return null;
  if (snap.offline) return snap;
  const updatedAt = snap.updatedAt ?? 0;
  if (!updatedAt || Date.now() - updatedAt >= maxAgeMs) {
    return {
      ...snap,
      offline: true,
      isStreaming: false,
      is_streaming: false,
    };
  }
  if (snap.isStreaming && !isSnapshotFresh(snap, SNAPSHOT_LIVE_MS)) {
    return {
      ...snap,
      offline: true,
      isStreaming: false,
      is_streaming: false,
    };
  }
  return snap;
}

export function isSnapshotUsable(snap) {
  const live = decayStaleSnapshot(snap);
  if (!live || live.offline) return false;
  if (live.isStreaming) {
    return isSnapshotFresh(live, SNAPSHOT_LIVE_MS);
  }
  if (live.updatedAt && Date.now() - live.updatedAt < PRESENCE_STALE_MS) {
    return Boolean(live.latestPrediction || live.latestReading);
  }
  return false;
}

export function isSnapshotOnline(snap) {
  const live = decayStaleSnapshot(snap);
  if (!live || live.offline) return false;
  if (!live.updatedAt) return false;
  if (Date.now() - live.updatedAt >= PRESENCE_STALE_MS) return false;
  if (live.isStreaming) {
    return isSnapshotFresh(live, SNAPSHOT_LIVE_MS);
  }
  return true;
}

export function isMirrorLive(snap) {
  const live = decayStaleSnapshot(snap);
  if (!live || live.offline) return false;
  if (!live.isStreaming) return false;
  return isSnapshotUsable(live) && Boolean(live.latestReading || live.latestPrediction);
}

export function pickMergedSnapshot(localSnap, remoteSnap) {
  const local = decayStaleSnapshot(localSnap);
  const remote = decayStaleSnapshot(remoteSnap);
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;
  return (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
}

export function mergeSnapshots(local = {}, remote = {}, registry = []) {
  const ids = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
    ...(registry || []).map((t) => t.id),
  ]);
  const merged = {};
  ids.forEach((id) => {
    const picked = pickMergedSnapshot(local[id], remote[id]);
    if (picked) merged[id] = picked;
  });
  return merged;
}
