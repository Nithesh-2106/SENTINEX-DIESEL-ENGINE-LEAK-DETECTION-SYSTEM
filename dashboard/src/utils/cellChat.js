import { loadJson, saveJson, uid } from "../lib/storage.js";
import { getChatMessageCache, insertChatMessage } from "../lib/supabaseChatMessages.js";
import { getTesterDisplayName, isHeadRole, isTesterRole } from "./testerRegistry.js";

export const CELL_THREADS_KEY = "cat_cell_threads";
export const GROUP_THREAD_ID = "group_tc03";
const LEGACY_KEY = "cat_cell_messages";

/** Stable DM thread id for two participants. */
export function dmThreadId(a, b) {
  return `dm_${[a, b].sort().join("__")}`;
}

function chatTesters(registry) {
  if (!Array.isArray(registry)) return [];
  return registry.filter((t) => isTesterRole(t.id) && t.isActive !== false);
}

export function threadParticipants(threadId, registry = null) {
  if (threadId === GROUP_THREAD_ID) {
    const list = chatTesters(registry);
    return ["head", ...list.map((t) => t.id)];
  }
  if (threadId.startsWith("dm_")) {
    return threadId.slice(3).split("__");
  }
  return [];
}

export function canAccessThread(role, threadId, registry = null) {
  if (!role) return false;
  return threadParticipants(threadId, registry).includes(role);
}

export function loadThreadMessages() {
  const cached = getChatMessageCache();
  if (cached.length > 0) return cached;
  return loadJson(CELL_THREADS_KEY, []);
}

export function saveThreadMessages(messages) {
  saveJson(CELL_THREADS_KEY, messages);
}

/** One-time migration from legacy shared inbox to per-thread DMs. */
export function migrateLegacyMessages() {
  const legacy = loadJson(LEGACY_KEY, []);
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  const existing = loadThreadMessages();
  if (existing.length > 0) {
    saveJson(LEGACY_KEY, []);
    return;
  }

  const migrated = [];
  legacy.forEach((m) => {
    const from = m.from;
    if (!from) return;
    let threadId;
    if (from === "head") {
      // Legacy head messages were broadcast — attach to group thread only.
      threadId = GROUP_THREAD_ID;
    } else if (isTesterRole(from)) {
      threadId = dmThreadId("head", from);
    } else {
      return;
    }
    migrated.push({
      id: m.id || uid("msg"),
      threadId,
      from,
      text: m.text,
      ts: m.ts || Date.now(),
    });
  });

  if (migrated.length) saveThreadMessages(migrated);
  saveJson(LEGACY_KEY, []);
}

export function getMessagesForThread(threadId) {
  return loadThreadMessages()
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.ts - b.ts);
}

export async function sendThreadMessage({ from, threadId, text, attachment = null, registry = null }) {
  if (!from || !threadId) return null;
  if (!canAccessThread(from, threadId, registry)) return null;

  const trimmed = text?.trim() || "";
  if (!trimmed && !attachment) return null;

  try {
    const msg = await insertChatMessage({ threadId, from, text: trimmed, attachment });
    window.dispatchEvent(new CustomEvent("cat-cell-message", { detail: msg }));
    window.dispatchEvent(new CustomEvent("cat-cell-messages-updated"));
    return msg;
  } catch (err) {
    console.warn("[SENTINEX] sendThreadMessage:", err);
    return null;
  }
}

export function listThreadsForRole(role, registry = null) {
  migrateLegacyMessages();
  const reg = chatTesters(registry);
  const threads = [];

  if (isHeadRole(role)) {
    reg.forEach((t) => {
      threads.push({
        id: dmThreadId("head", t.id),
        type: "dm",
        label: t.displayName,
        peerId: t.id,
        peerRole: t.id,
      });
    });
    threads.push({
      id: GROUP_THREAD_ID,
      type: "group",
      label: "Cell Group",
      peerId: null,
      peerRole: "group",
    });
    return threads;
  }

  if (isTesterRole(role)) {
    threads.push({
      id: dmThreadId("head", role),
      type: "dm",
      label: getTesterDisplayName("head"),
      peerId: "head",
      peerRole: "head",
    });
    reg.filter((t) => t.id !== role).forEach((t) => {
      threads.push({
        id: dmThreadId(role, t.id),
        type: "dm",
        label: t.displayName,
        peerId: t.id,
        peerRole: t.id,
      });
    });
    threads.push({
      id: GROUP_THREAD_ID,
      type: "group",
      label: "Cell Group",
      peerId: null,
      peerRole: "group",
    });
  }

  return threads;
}

export function unreadCountForRole(role, messagesReadAt = {}, registry = null) {
  if (!role) return 0;
  const lastRead = messagesReadAt[role] || 0;
  const threads = listThreadsForRole(role, registry).map((t) => t.id);
  return loadThreadMessages().filter(
    (m) => threads.includes(m.threadId) && m.from !== role && m.ts > lastRead,
  ).length;
}

export function unreadCountForThread(role, threadId, messagesReadAt = {}) {
  if (!role || !canAccessThread(role, threadId)) return 0;
  const lastRead = messagesReadAt[`${role}:${threadId}`] ?? messagesReadAt[role] ?? 0;
  return getMessagesForThread(threadId).filter((m) => m.from !== role && m.ts > lastRead).length;
}

export function displayNameForMessage(from, registry = null) {
  if (from === "head") return getTesterDisplayName("head");
  return getTesterDisplayName(from, registry);
}
