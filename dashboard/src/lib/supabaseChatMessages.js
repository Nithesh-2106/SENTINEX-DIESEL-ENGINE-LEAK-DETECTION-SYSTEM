// Ops Chat messages backed by public.chat_messages.
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

let messageCache = [];

export function getChatMessageCache() {
  return messageCache;
}

export function setChatMessageCache(messages) {
  messageCache = Array.isArray(messages) ? messages : [];
}

function mapRow(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    from: row.sender_role,
    text: row.body || "",
    ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    ...(row.attachment ? { attachment: row.attachment } : {}),
  };
}

export async function fetchChatMessagesForThreads(threadIds = []) {
  if (!isSupabaseConfigured() || !loadAuthSession()?.userId) {
    return messageCache;
  }

  let query = supabase
    .from("chat_messages")
    .select("id, thread_id, sender_role, sender_profile_id, body, attachment, created_at")
    .order("created_at", { ascending: true })
    .limit(500);

  if (threadIds.length > 0) {
    query = query.in("thread_id", threadIds);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[SENTINEX] chat_messages load:", error);
    return messageCache;
  }

  const mapped = (data || []).map(mapRow);
  if (threadIds.length > 0) {
    const keep = messageCache.filter((m) => !threadIds.includes(m.threadId));
    messageCache = [...keep, ...mapped].sort((a, b) => a.ts - b.ts);
  } else {
    messageCache = mapped;
  }
  return messageCache;
}

export async function insertChatMessage({ threadId, from, text, attachment = null }) {
  const session = loadAuthSession();
  if (!isSupabaseConfigured() || !session?.userId || !threadId || !from) {
    throw new Error("Chat session unavailable");
  }

  const body = text?.trim() || "";
  if (!body && !attachment) {
    throw new Error("Empty message");
  }

  const payload = {
    thread_id: threadId,
    sender_role: from,
    sender_profile_id: session.userId,
    body: body || (attachment?.type === "file" ? `📎 ${attachment.name || "File"}` : "📄 Attachment"),
    attachment: attachment || null,
  };

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select("id, thread_id, sender_role, sender_profile_id, body, attachment, created_at")
    .single();

  if (error) {
    console.warn("[SENTINEX] chat_messages insert:", error);
    throw new Error(error.message || "Could not send message");
  }

  const msg = mapRow(data);
  messageCache = [...messageCache.filter((m) => m.id !== msg.id), msg].sort((a, b) => a.ts - b.ts);
  return msg;
}

export async function syncChatFromDb(threadIds = []) {
  const next = await fetchChatMessagesForThreads(threadIds);
  window.dispatchEvent(new CustomEvent("cat-cell-messages-updated"));
  return next;
}
