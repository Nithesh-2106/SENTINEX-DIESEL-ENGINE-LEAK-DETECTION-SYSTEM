// Session report upload helpers backed by Supabase Storage.
import { appendSessionRecord } from "./supabasePersistence.js";
import { loadAuthSession } from "./authSession.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { generateSessionReportBlob } from "../utils/generatePdf.js";

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildReportStoragePath(sessionLog, userId = loadAuthSession()?.userId) {
  if (!userId || !sessionLog?.sessionId) return null;
  return `reports/${userId}/${sessionLog.sessionId}.pdf`;
}

export async function uploadSessionReport(sessionLog) {
  const session = loadAuthSession();
  const path = buildReportStoragePath(sessionLog, session?.userId);
  if (!isSupabaseConfigured() || !path) return null;

  const pdf = generateSessionReportBlob(sessionLog);
  const { error } = await supabase.storage.from("sentinex-files").upload(
    path,
    decodeBase64(pdf.base64),
    {
      contentType: pdf.mimeType,
      upsert: true,
    },
  );

  if (error) {
    console.warn("[SENTINEX] report upload:", error);
    throw new Error(error.message || "Could not upload report");
  }

  await appendSessionRecord({
    sessionId: sessionLog.sessionId,
    recordType: "report",
    payload: {
      path,
      filename: pdf.filename,
      mime_type: pdf.mimeType,
      uploaded_at: new Date().toISOString(),
    },
  });

  return {
    path,
    filename: pdf.filename,
    mimeType: pdf.mimeType,
  };
}
