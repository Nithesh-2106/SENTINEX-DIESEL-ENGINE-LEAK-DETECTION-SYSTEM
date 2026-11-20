import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TIMELINE_PREFIX,
  TIMELINE_SYNC_EVENT,
  buildTimelineMarkers,
  loadTimeline,
  mergeTimelines,
} from "../utils/sessionTimeline.js";
import { isHeadRole, isTesterRole } from "../utils/testerRegistry.js";

export function useSessionTimeline({ role, headViewingTester, headOverviewMode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const onSync = () => refresh();
    const onStorage = (e) => {
      if (e.key?.startsWith(TIMELINE_PREFIX)) refresh();
    };
    window.addEventListener(TIMELINE_SYNC_EVENT, onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TIMELINE_SYNC_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const source = useMemo(() => {
    if (isHeadRole(role)) {
      if (headOverviewMode || !headViewingTester) return mergeTimelines();
      return loadTimeline(headViewingTester);
    }
    if (isTesterRole(role)) return loadTimeline(role);
    return { sessionStartMs: Date.now(), events: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, headViewingTester, headOverviewMode, tick]);

  const markers = useMemo(
    () => buildTimelineMarkers(source.events || [], source.sessionStartMs),
    [source],
  );

  return {
    events: source.events || [],
    markers,
    sessionStartMs: source.sessionStartMs || Date.now(),
    refresh,
  };
}
