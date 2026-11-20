import { saveJson, loadJson, uid } from "../lib/storage.js";
import { sendThreadMessage } from "./cellChat.js";

const FILE_PREFIX = "cat_chat_file_";
export const MAX_CHAT_FILE_BYTES = 2.5 * 1024 * 1024;

export const CHAT_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function saveChatFile(fileId, meta) {
  saveJson(`${FILE_PREFIX}${fileId}`, { ...meta, savedAt: Date.now() });
}

export function loadChatFile(fileId) {
  if (!fileId) return null;
  return loadJson(`${FILE_PREFIX}${fileId}`, null);
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function shareFileToThread({ from, threadId, file, caption = "", registry = null }) {
  if (!from || !threadId || !file) return null;
  if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error(`File is too large (max ${formatFileSize(MAX_CHAT_FILE_BYTES)})`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const fileId = uid("file");
  saveChatFile(fileId, {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
  });

  return sendThreadMessage({
    from,
    threadId,
    text: caption.trim() || `📎 ${file.name}`,
    attachment: {
      type: "file",
      fileId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
    registry,
  });
}

export function downloadChatFile(attachment) {
  const stored = loadChatFile(attachment?.fileId);
  if (!stored?.dataUrl) return false;
  const a = document.createElement("a");
  a.href = stored.dataUrl;
  a.download = attachment.name || stored.name || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
