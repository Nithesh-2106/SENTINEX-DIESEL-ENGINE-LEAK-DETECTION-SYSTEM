import {
  decayStaleSnapshot,
  enrichLiveTesters,
  isSnapshotOnline,
  loadPresenceMap,
  PRESENCE_STALE_MS,
} from "./testerPresence.js";
import { loadTesterRegistry } from "./testerRegistry.js";
import { loadAllTesterSnapshots } from "./testerSnapshot.js";
import { isSnapshotFresh, SNAPSHOT_LIVE_MS } from "./testerSnapshotStore.js";

/** Build the head console tester board directly from shared storage. */
export function buildTesterBoard(snapshots = null, registry = null) {
  const list = registry || loadTesterRegistry();
  const pmap = loadPresenceMap();
  const snaps = snapshots || loadAllTesterSnapshots(registry);
  const now = Date.now();

  const base = list.map((t) => {
    const p = pmap[t.id];
    const snap = decayStaleSnapshot(snaps[t.id]);
    const presenceOnline = Boolean(p && now - (p.updatedAt || 0) < PRESENCE_STALE_MS);
    const snapStreaming = Boolean(
      snap && !snap.offline && snap.isStreaming && isSnapshotFresh(snap, SNAPSHOT_LIVE_MS),
    );
    const snapOnline = Boolean(snap && !snap.offline && isSnapshotOnline(snap));
    return { ...t, online: presenceOnline || snapStreaming || snapOnline, presence: p || null };
  });

  return enrichLiveTesters(base, Object.fromEntries(
    Object.entries(snaps).map(([id, snap]) => [id, decayStaleSnapshot(snap)]).filter(([, snap]) => snap),
  ));
}
