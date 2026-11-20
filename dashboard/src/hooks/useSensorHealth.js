import { useEffect, useState } from "react";

/**
 * Poll sensor health summary from the backend (2s interval).
 */
export function useSensorHealth(engineId, enabled = true) {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !engineId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const fetchHealth = async () => {
      try {
        const res = await fetch(`/api/sensor-health/${engineId}`);
        const data = await res.json();
        if (!cancelled && !data.error) {
          setHealthData(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("Sensor health fetch failed:", err);
        if (!cancelled) setLoading(false);
      }
    };

    fetchHealth();
    const id = setInterval(fetchHealth, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [engineId, enabled]);

  return { healthData, loading };
}
