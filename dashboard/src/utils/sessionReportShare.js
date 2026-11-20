import { saveJson, loadJson } from "../lib/storage.js";
import { GROUP_THREAD_ID, sendThreadMessage } from "./cellChat.js";
import { getOverallStatus } from "./generatePdf.js";
import { countTotalLeakLocations } from "./sessionReport.js";
import axios from "axios";

const SNAP_PREFIX = "cat_report_snap_";

export function saveReportSnapshot(sessionLog) {
  const id = sessionLog.sessionId || `snap_${Date.now()}`;
  saveJson(`${SNAP_PREFIX}${id}`, { ...sessionLog, snapshotAt: Date.now() });
  return id;
}

export function loadReportSnapshot(sessionId) {
  if (!sessionId) return null;
  return loadJson(`${SNAP_PREFIX}${sessionId}`, null);
}

export function buildReportShareText(sessionLog, senderName) {
  const status = getOverallStatus(sessionLog);
  return [
    `📄 Session Report — ${sessionLog.sessionId || "session"}`,
    `Shared by ${senderName}`,
    sessionLog.testerName ? `Operator: ${sessionLog.testerName}` : null,
    sessionLog.bayId ? `Bay: ${sessionLog.bayId}` : null,
    `Engine: ${sessionLog.engineName || "—"}`,
    `Status: ${status.text}`,
    `Readings: ${sessionLog.totalReadings || 0} · Leaks: ${(sessionLog.leakEvents || []).length}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function shareReportToThread({ from, threadId, sessionLog, senderName, reportStoragePath = null, registry = null }) {
  if (!from || !threadId || !sessionLog) return null;
  const sessionId = saveReportSnapshot(sessionLog);
  const status = getOverallStatus(sessionLog);
  return sendThreadMessage({
    from,
    threadId,
    text: buildReportShareText(sessionLog, senderName),
    registry,
    attachment: {
      type: "session_report",
      sessionId,
      engineName: sessionLog.engineName,
      engineSerial: sessionLog.engineSerial,
      totalReadings: sessionLog.totalReadings || 0,
      leakCount: (sessionLog.leakEvents || []).length,
      faultCount: (sessionLog.sensorFaults || []).length,
      statusText: status.text,
      statusIcon: status.icon,
      startTime: sessionLog.startTime,
      endTime: sessionLog.endTime,
      testCellId: sessionLog.testCellId || "TC-03",
      reportStoragePath,
    },
  });
}

export async function shareReportToCellGroup(from, sessionLog, senderName, reportStoragePath = null) {
  return shareReportToThread({
    from,
    threadId: GROUP_THREAD_ID,
    sessionLog,
    senderName,
    reportStoragePath,
  });
}

export function buildReportEmailBody(sessionLog, senderName) {
  const status = getOverallStatus(sessionLog);
  const leakLocations = countTotalLeakLocations(sessionLog);
  return [
    "SENTINEX Diesel Leak Intelligence — Test Cell Report",
    "",
    `Shared by: ${senderName}`,
    sessionLog.testerName ? `Operator: ${sessionLog.testerName}` : null,
    sessionLog.bayId ? `Bay: ${sessionLog.bayId}` : null,
    `Session ID: ${sessionLog.sessionId || "N/A"}`,
    `Engine: ${sessionLog.engineName || "N/A"}`,
    `Date: ${sessionLog.startTime ? new Date(sessionLog.startTime).toLocaleString("en-IN") : "N/A"}`,
    `Overall Status: ${status.text}`,
    `Total Readings: ${sessionLog.totalReadings || 0}`,
    `Leak Locations: ${leakLocations}`,
    `Leak Detections: ${(sessionLog.leakEvents || []).length}`,
    "",
    "Full branded PDF report is attached.",
    "",
    "— SENTINEX Test Cell Monitoring",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReportEmailUrl(sessionLog, senderName, toEmail = "") {
  const subject = `SENTINEX Test Cell Report — ${sessionLog.sessionId || "Session"}`;
  const body = buildReportEmailBody(sessionLog, senderName);
  const to = toEmail ? encodeURIComponent(toEmail.trim()) : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function fetchReportEmailConfig() {
  const res = await axios.get("/api/report/email-config", { timeout: 5000 });
  return res.data;
}

export async function sendReportEmailViaSmtp({
  toEmail,
  sessionLog,
  senderName,
  pdfBase64,
  pdfFilename,
}) {
  const subject = `SENTINEX Test Cell Report — ${sessionLog.sessionId || "Session"}`;
  const body_text = buildReportEmailBody(sessionLog, senderName);
  const res = await axios.post(
    "/api/report/send-email",
    {
      to_email: toEmail.trim(),
      subject,
      body_text,
      pdf_base64: pdfBase64,
      pdf_filename: pdfFilename,
      sender_name: senderName,
      session_id: sessionLog.sessionId || null,
    },
    { timeout: 60000 }
  );
  return res.data;
}
