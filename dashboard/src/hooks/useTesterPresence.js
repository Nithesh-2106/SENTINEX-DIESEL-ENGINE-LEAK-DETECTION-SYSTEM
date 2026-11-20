import { useCallback, useEffect, useMemo, useState } from "react";
import {
  enrichLiveTesters,
  loadPresenceMap,
  updatePresence,
} from "../utils/testerPresence.js";
import { getTesterDisplayName, isHeadRole, loadTesterRegistry, REGISTRY_CHANGE_EVENT } from "../utils/testerRegistry.js";
import { isLeakActivePrediction, isSensorFaultActive } from "../lib/systemState.js";
import { loadTesterSnapshot } from "../utils/testerSnapshot.js";

/**
 * Publishes this console's live status and subscribes to all tester presence.
 */
export function useTesterPresence({
  role,
  activeTab,
  activeEngine,
  currentScenario,
  isStreaming,
  readingCount,
  latestPrediction,
  snapshots = {},
}) {
  const [presenceMap, setPresenceMap] = useState(() => loadPresenceMap());

  const refresh = useCallback(() => {
    setPresenceMap(loadPresenceMap());
  }, []);

  const publish = useCallback(() => {
    if (!role) return;
    if (loadTesterSnapshot(role)?.offline) return;
    const name = getTesterDisplayName(role);
    const leak = isLeakActivePrediction(latestPrediction);
    const sensorFault = isSensorFaultActive(latestPrediction);
    updatePresence(role, {
      displayName: name,
      activeTab,
      engine: activeEngine,
      scenario: currentScenario,
      isStreaming,
      readingCount,
      leakDetected: leak,
      sensorFaultDetected: sensorFault,
      statusLabel: isHeadRole(role)
        ? "Supervising cell"
        : isStreaming
          ? sensorFault
            ? "Streaming · sensor fault"
            : leak
              ? "Streaming · leak active"
              : "Streaming · monitoring"
          : "Idle · ready",
    }, name);
  }, [
    role,
    activeTab,
    activeEngine,
    currentScenario,
    isStreaming,
    readingCount,
    latestPrediction,
  ]);

  useEffect(() => {
    if (!role) return undefined;
    publish();
    const publishId = window.setInterval(publish, 2500);

    const onUpdate = () => refresh();
    const onStorage = (e) => {
      if (e.key === "cat_tester_presence") refresh();
    };
    const onSnap = () => refresh();
    window.addEventListener("cat-presence-updated", onUpdate);
    window.addEventListener("storage", onStorage);
    window.addEventListener("cat-tester-snapshot", onSnap);
    window.addEventListener(REGISTRY_CHANGE_EVENT, onUpdate);

    return () => {
      clearInterval(publishId);
      window.removeEventListener("cat-presence-updated", onUpdate);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cat-tester-snapshot", onSnap);
      window.removeEventListener(REGISTRY_CHANGE_EVENT, onUpdate);
    };
  }, [role, publish, refresh]);

  const registry = loadTesterRegistry();
  const liveTesters = useMemo(() => {
    const base = registry.map((t) => {
      const p = presenceMap[t.id];
      if (!p) return { ...t, online: false, presence: null };
      const online = Date.now() - (p.updatedAt || 0) < 45000;
      return { ...t, online, presence: p };
    });
    return enrichLiveTesters(base, snapshots);
  }, [presenceMap, snapshots, registry.length]);

  return { presenceMap, liveTesters, publish, refresh };
}
