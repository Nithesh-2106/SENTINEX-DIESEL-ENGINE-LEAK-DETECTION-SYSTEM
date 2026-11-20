// Cell chat sync via Supabase Storage text files with local cache compatibility.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { loadJson, saveJson } from "./storage.js";

const CELL_THREADS_KEY = "cat_cell_threads";

function chatPath(threadId) {
  return `chat/${threadId}/messages.txt`;
}

function parseMessages(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeMessages(messages) {
  return JSON.stringify(messages, null, 2);
}

function mergeMessages(a = [], b = []) {
  const byId = new Map();
  [...a, ...b].forEach((msg) => {
    if (!msg?.id) return;
    byId.set(msg.id, { ...byId.get(msg.id), ...msg });
  });
  return [...byId.values()].sort((left, right) => (left.ts || 0) - (right.ts || 0));
}

export async function readThreadMessagesFromStorage(threadId) {
  if (!isSupabaseConfigured() || !loadAuthSession()?.userId || !threadId) return [];
  const { data, error } = await supabase.storage.from("sentinex-files").download(chatPath(threadId));
  if (error) {
    const missing = error.statusCode === "404" || /not found/i.test(error.message || "");
    if (!missing) {
      console.warn("[SENTINEX] chat download:", error);
    }
    return [];
  }
  const text = await data.text();
  return parseMessages(text);
}

export async function writeThreadMessagesToStorage(threadId, messages) {
  if (!isSupabaseConfigured() || !loadAuthSession()?.userId || !threadId) return;

  const merged = mergeMessages(await readThreadMessagesFromStorage(threadId), messages);
  const body = serializeMessages(merged);
  const { error } = await supabase.storage.from("sentinex-files").upload(
    chatPath(threadId),
    new Blob([body], { type: "text/plain;charset=utf-8" }),
    {
      contentType: "text/plain; charset=utf-8",
      upsert: true,
    },
  );

  if (error) {
    console.warn("[SENTINEX] chat upload:", error);
  }
}

export async function syncChatThreadsFromStorage(threadIds = []) {
  if (!isSupabaseConfigured() || !loadAuthSession()?.userId || !threadIds.length) return;

  const current = loadJson(CELL_THREADS_KEY, []);
  let merged = Array.isArray(current) ? current : [];

  for (const threadId of threadIds) {
    const remote = await readThreadMessagesFromStorage(threadId);
    merged = mergeMessages(merged, remote);
  }

  saveJson(CELL_THREADS_KEY, merged);
  window.dispatchEvent(new CustomEvent("cat-cell-messages-updated"));
}
