import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBayLiveSnapshots } from "../lib/supabaseBayState.js";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient.js";
import { mergeSnapshots } from "../utils/cellSyncMerge.js";
import { useTesterSnapshotStore, notifySnapshotStore } from "../utils/testerSnapshotStore.js";/** Subscribes to all tester dashboard snapshots (head + live boards). */
export function useTesterSnapshots(enabled, { useSupabase = false, registry = [] } = {}) {
  const localSnapshots = useTesterSnapshotStore(Boolean(enabled));
  const [supabaseSnapshots, setSupabaseSnapshots] = useState({});

  useEffect(() => {
    if (!enabled || !useSupabase || !isSupabaseConfigured()) {
      setSupabaseSnapshots({});
      return undefined;
    }

    let alive = true;
    const load = async () => {
      const next = await fetchBayLiveSnapshots(registry);
      if (alive) setSupabaseSnapshots(next);
    };

    void load();
    const pollId = window.setInterval(load, 2500);

    const channel = supabase
      .channel("bay_live_state_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bay_live_state" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      alive = false;
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [enabled, useSupabase, registry]);

  const snapshots = useMemo(() => {
    if (!enabled) return {};
    if (!useSupabase) return localSnapshots;
    return mergeSnapshots(localSnapshots, supabaseSnapshots, registry);
  }, [enabled, useSupabase, localSnapshots, supabaseSnapshots, registry]);

  const refresh = useCallback(() => {
    if (useSupabase) {
      void fetchBayLiveSnapshots(registry).then(setSupabaseSnapshots);
    }
    notifySnapshotStore();
  }, [useSupabase, registry]);

  return { snapshots, refresh };
}
