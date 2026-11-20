/**
 * Smoke test for head ↔ tester localStorage mirroring.
 * Run in browser console on the HEAD tab after Tester 1 is streaming:
 *
 *   import('/src/utils/testerSnapshotStore.js').then(m => window.__mirrorTest(m))
 *
 * Or paste mirrorSmokeTest() after loading the dashboard.
 */
import { loadTesterSnapshot, SNAPSHOT_PREFIX } from "./testerSnapshot.js";
import {
  buildSnapshotRevision,
  isSnapshotFresh,
  loadSnapshotIndex,
  readAllSnapshots,
  SNAPSHOT_LIVE_MS,
} from "./testerSnapshotStore.js";
import { isMirrorLive, isSnapshotUsable } from "./testerPresence.js";
import { loadTesterRegistry } from "./testerRegistry.js";

export function mirrorSmokeTest(role = "tester") {
  const snap = loadTesterSnapshot(role);
  const index = loadSnapshotIndex();
  const all = readAllSnapshots();
  const registry = loadTesterRegistry();
  const rev = buildSnapshotRevision(registry);

  const report = {
    role,
    storageKey: `${SNAPSHOT_PREFIX}${role}`,
    indexUpdatedAt: index[role] ?? null,
    snapshotUpdatedAt: snap?.updatedAt ?? null,
    ageMs: snap?.updatedAt ? Date.now() - snap.updatedAt : null,
    isStreaming: snap?.isStreaming ?? false,
    readingCount: snap?.readingCount ?? 0,
    hasReading: Boolean(snap?.latestReading),
    hasPrediction: Boolean(snap?.latestPrediction),
    isSnapshotUsable: isSnapshotUsable(snap),
    isSnapshotFresh: isSnapshotFresh(snap, SNAPSHOT_LIVE_MS),
    isMirrorLive: isMirrorLive(snap),
    revision: rev,
    allBayIds: Object.keys(all),
    pass: Boolean(snap && isMirrorLive(snap)),
  };

  console.table(report);
  if (!report.pass) {
    console.warn(
      "[mirrorSmokeTest] FAIL — Head cannot mirror live.",
      snap
        ? "Snapshot exists but is stale; ensure Tester tab is streaming in the SAME browser (same localhost port)."
        : "No snapshot in localStorage; log in as tester and start streaming.",
    );
  } else {
    console.info("[mirrorSmokeTest] PASS — Snapshot is live and head should mirror.");
  }
  return report;
}

if (typeof window !== "undefined") {
  window.mirrorSmokeTest = () => mirrorSmokeTest("tester");
}
