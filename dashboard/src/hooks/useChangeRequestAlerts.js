import { useCallback, useEffect, useRef, useState } from "react";
import { loadJson, saveJson } from "../lib/storage.js";
import { isHeadRole, isTesterRole } from "../utils/testerRegistry.js";

function seenKeyForRole(role) {
  return `cat_alerted_reqs_${role || "unknown"}`;
}

function loadSeenSet(role) {
  const raw = loadJson(seenKeyForRole(role), []);
  return new Set(Array.isArray(raw) ? raw : []);
}

function persistSeenSet(role, set) {
  saveJson(seenKeyForRole(role), [...set].slice(-160));
}

function alertKeyFor(request, variant) {
  if (variant === "submitted") return `${request.id}:submitted`;
  if (variant === "peer_pending") return `${request.id}:peer_pending`;
  if (variant === "peer_decided") return `${request.id}:peer_decided:${request.status}`;
  if (request.status === "pending") return request.id;
  return `${request.id}:${request.status}`;
}

/**
 * Cross-tab request alerts — head + all tester consoles.
 */
export function useChangeRequestAlerts({ role, requests }) {
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(new Set());
  const queueKeysRef = useRef(new Set());

  const resetQueue = useCallback(() => {
    setQueue([]);
    queueKeysRef.current = new Set();
  }, []);

  const pushAlert = useCallback((alert) => {
    if (seenRef.current.has(alert.key) || queueKeysRef.current.has(alert.key)) return;
    queueKeysRef.current.add(alert.key);
    setQueue((prev) => {
      if (prev.some((a) => a.key === alert.key)) return prev;
      return [alert, ...prev].sort(
        (a, b) => (b.request.decidedAt || b.request.createdAt) - (a.request.decidedAt || a.request.createdAt)
      );
    });
  }, []);

  const replaceOwnAlert = useCallback((request, variant) => {
    const key = alertKeyFor(request, variant);
    if (seenRef.current.has(key)) return;

    queueKeysRef.current.delete(`${request.id}:submitted`);
    seenRef.current.add(`${request.id}:submitted`);

    setQueue((prev) => {
      const filtered = prev.filter((a) => a.request.id !== request.id || a.variant.startsWith("peer"));
      if (filtered.some((a) => a.key === key)) return filtered;
      queueKeysRef.current.add(key);
      const next = [{ key, request, variant }, ...filtered];
      return next.sort(
        (a, b) => (b.request.decidedAt || b.request.createdAt) - (a.request.decidedAt || a.request.createdAt)
      );
    });
  }, []);

  const enqueueAlerts = useCallback((incoming) => {
    if (!role) return;

    if (isHeadRole(role)) {
      (incoming || [])
        .filter((r) => r.status === "pending")
        .forEach((r) => pushAlert({ key: alertKeyFor(r, "pending"), request: r, variant: "pending" }));
      return;
    }

    if (!isTesterRole(role)) return;

    (incoming || []).forEach((r) => {
      const isOwn = r.requestedBy === role;
      if (r.status === "pending") {
        if (isOwn) {
          pushAlert({ key: alertKeyFor(r, "submitted"), request: r, variant: "submitted" });
        } else {
          pushAlert({ key: alertKeyFor(r, "peer_pending"), request: r, variant: "peer_pending" });
        }
      } else if (r.status === "approved" || r.status === "rejected") {
        const key = alertKeyFor(r, isOwn ? r.status : "peer_decided");
        if (seenRef.current.has(key)) return;
        if (isOwn) {
          replaceOwnAlert(r, r.status);
        } else {
          pushAlert({ key, request: r, variant: "peer_decided" });
        }
      }
    });
  }, [role, pushAlert, replaceOwnAlert]);

  useEffect(() => {
    seenRef.current = loadSeenSet(role);
    resetQueue();
  }, [role, resetQueue]);

  useEffect(() => {
    if (!role) {
      resetQueue();
      return undefined;
    }

    const onStorage = (e) => {
      if (e.key === "cat_requests") enqueueAlerts(requests || []);
    };
    const onCreated = (e) => {
      if (!e.detail) return;
      if (isTesterRole(role) && e.detail.requestedBy === role) {
        replaceOwnAlert(e.detail, "submitted");
      }
      enqueueAlerts(requests || []);
    };
    const onDecided = (e) => {
      if (!e.detail) return;
      if (isTesterRole(role) && e.detail.requestedBy === role) {
        replaceOwnAlert(e.detail, e.detail.status);
      }
      enqueueAlerts(requests || []);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("cat-request-created", onCreated);
    window.addEventListener("cat-request-decided", onDecided);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cat-request-created", onCreated);
      window.removeEventListener("cat-request-decided", onDecided);
    };
  }, [role, requests, resetQueue, replaceOwnAlert, enqueueAlerts]);

  useEffect(() => {
    enqueueAlerts(requests);
  }, [requests, enqueueAlerts]);

  const dismissAlert = useCallback((key) => {
    seenRef.current.add(key);
    persistSeenSet(role, seenRef.current);
    queueKeysRef.current.delete(key);
    setQueue((prev) => prev.filter((a) => a.key !== key));
  }, [role]);

  return {
    alerts: queue,
    pendingAlertCount: queue.length,
    dismissAlert,
  };
}
