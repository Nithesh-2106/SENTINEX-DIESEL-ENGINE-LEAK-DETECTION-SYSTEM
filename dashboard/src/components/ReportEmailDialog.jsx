import React, { useEffect, useState } from "react";
import {
  buildReportEmailUrl,
  fetchReportEmailConfig,
  sendReportEmailViaSmtp,
} from "../utils/sessionReportShare.js";
import { generateSessionReportBlob } from "../utils/generatePdf.js";

/**
 * @param {{
 *   open: boolean;
 *   sessionLog: object;
 *   senderName: string;
 *   onClose: () => void;
 *   onSent?: (result: object) => void;
 * }} props
 */
export default function ReportEmailDialog({
  open,
  sessionLog,
  senderName,
  onClose,
  onSent,
}) {
  const [toEmail, setToEmail] = useState("");
  const [smtpConfig, setSmtpConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
    setLoadingConfig(true);
    fetchReportEmailConfig()
      .then((cfg) => setSmtpConfig(cfg))
      .catch(() => setSmtpConfig({ configured: false }))
      .finally(() => setLoadingConfig(false));
  }, [open]);

  if (!open) return null;

  const handleMailtoFallback = () => {
    if (!toEmail.trim()) {
      setError("Enter the recipient email address.");
      return;
    }
    window.location.href = buildReportEmailUrl(sessionLog, senderName, toEmail);
    setSuccess("Opened your email app — attach the downloaded PDF manually if needed.");
  };

  const handleSendSmtp = async () => {
    const email = toEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid recipient email address.");
      return;
    }
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const { base64, filename } = generateSessionReportBlob(sessionLog);
      const result = await sendReportEmailViaSmtp({
        toEmail: email,
        sessionLog,
        senderName,
        pdfBase64: base64,
        pdfFilename: filename,
      });
      setSuccess(`Report sent to ${result.to} with PDF attached.`);
      onSent?.(result);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      let message = err?.message || "Failed to send email.";
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail
          .map((item) => {
            const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
            return loc ? `${loc}: ${item?.msg || "invalid"}` : item?.msg;
          })
          .filter(Boolean)
          .join("; ");
      }
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-email-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 bg-[#0D1B2A] px-5 py-4 rounded-t-xl">
          <h3 id="report-email-title" className="text-sm font-bold text-[#FFB800]">
            Email Session Report
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            PDF attachment + summary sent via SMTP
          </p>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-gray-700">
          <div>
            <label htmlFor="report-email-to" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Recipient email
            </label>
            <input
              id="report-email-to"
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              placeholder="supervisor@caterpillar.com"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              disabled={sending}
              autoFocus
            />
          </div>

          {loadingConfig ? (
            <p className="text-xs text-gray-500">Checking mail server…</p>
          ) : smtpConfig?.configured ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              SMTP ready — messages send from{" "}
              <span className="font-mono font-semibold">{smtpConfig.from_address}</span>
              {smtpConfig.host && (
                <span className="text-emerald-700"> ({smtpConfig.host})</span>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              SMTP is not configured on the API. Add{" "}
              <span className="font-mono">SMTP_HOST</span>,{" "}
              <span className="font-mono">SMTP_FROM</span>,{" "}
              <span className="font-mono">SMTP_USER</span>, and{" "}
              <span className="font-mono">SMTP_PASSWORD</span> to{" "}
              <span className="font-mono">.env</span> (see <span className="font-mono">.env.example</span>).
              You can still use your local mail app as fallback.
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {success}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4 rounded-b-xl">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            onClick={onClose}
            disabled={sending}
          >
            Close
          </button>
          {!smtpConfig?.configured && (
            <button
              type="button"
              className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              onClick={handleMailtoFallback}
              disabled={sending}
            >
              Open Mail App
            </button>
          )}
          <button
            type="button"
            className="rounded-lg bg-[#FFB800] px-4 py-2 text-sm font-bold text-[#0D1B2A] hover:bg-yellow-400 disabled:opacity-50"
            onClick={handleSendSmtp}
            disabled={sending || !smtpConfig?.configured}
          >
            {sending ? "Sending…" : "Send with PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
