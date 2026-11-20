import { useCallback, useEffect, useRef, useState } from "react";
import { loadJson } from "../lib/storage.js";
import { listThreadsForRole, loadThreadMessages, migrateLegacyMessages } from "../utils/cellChat.js";
import { defaultMessagesReadAt } from "../utils/testerRegistry.js";

function pickLatestUnread({ role, dismissed }) {
  if (!role) return null;

  migrateLegacyMessages();
  const threadIds = listThreadsForRole(role).map((t) => t.id);
  const readAt = loadJson("cat_messages_read_at", defaultMessagesReadAt());
  const lastRead = readAt[role] || 0;

  const unread = loadThreadMessages()
    .filter((m) => threadIds.includes(m.threadId) && m.from !== role && m.ts > lastRead)
    .sort((a, b) => a.ts - b.ts);

  if (!unread.length) return null;

  const latest = unread[unread.length - 1];
  if (dismissed.has(latest.id)) return null;

  return latest;
}

/**
 * Ops Chat toast/banner when peer sends a message (cross-tab safe).
 */
export function useCommsMessageAlerts({ role, activeTab }) {
  const [toast, setToast] = useState(null);
  const dismissedRef = useRef(new Set());
  const lastUnreadIdRef = useRef(null);

  const refreshToast = useCallback(() => {
    if (!role || activeTab === "comms") {
      setToast(null);
      return;
    }

    const latest = pickLatestUnread({ role, dismissed: dismissedRef.current });
    if (!latest) {
      setToast(null);
      lastUnreadIdRef.current = null;
      return;
    }

    if (latest.id !== lastUnreadIdRef.current) {
      dismissedRef.current.delete(latest.id);
      lastUnreadIdRef.current = latest.id;
    }

    if (dismissedRef.current.has(latest.id)) {
      setToast(null);
      return;
    }

    setToast(latest);
  }, [role, activeTab]);

  useEffect(() => {
    if (!role) {
      setToast(null);
      dismissedRef.current = new Set();
      lastUnreadIdRef.current = null;
      return;
    }
    refreshToast();
  }, [role, refreshToast]);

  useEffect(() => {
    if (!role) return undefined;

    const onUpdate = () => refreshToast();

    window.addEventListener("cat-cell-message", onUpdate);
    window.addEventListener("cat-cell-messages-updated", onUpdate);
    const onStorage = (e) => {
      if (e.key === "cat_cell_threads" || e.key === "cat_cell_messages" || e.key === "cat_messages_read_at") onUpdate();
    };
    window.addEventListener("storage", onStorage);

    const pollId = window.setInterval(onUpdate, 750);

    return () => {
      clearInterval(pollId);
      window.removeEventListener("cat-cell-message", onUpdate);
      window.removeEventListener("cat-cell-messages-updated", onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [role, refreshToast]);

  const dismissCommsToast = useCallback((id) => {
    if (id) dismissedRef.current.add(id);
    setToast(null);
  }, []);

  return { commsToast: toast, dismissCommsToast };
}
