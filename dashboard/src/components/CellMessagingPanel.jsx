import React, { useEffect, useRef, useState } from "react";
import { useAriaVoice } from "../hooks/useAriaVoice.js";
import { CHAT_FILE_ACCEPT, downloadChatFile, formatFileSize } from "../utils/chatAttachments.js";

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconAttach() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMic({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" fill={active ? "currentColor" : "none"} />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FileAttachmentCard({ attachment }) {
  if (!attachment || attachment.type !== "file") return null;
  const ext = (attachment.name || "").split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
  return (
    <button
      type="button"
      className="cell-msg-file-card"
      onClick={() => downloadChatFile(attachment)}
    >
      <span className="cell-msg-file-icon" aria-hidden>{ext}</span>
      <span className="cell-msg-file-copy">
        <span className="cell-msg-file-title">{attachment.name || "File"}</span>
        <span className="cell-msg-file-meta">{formatFileSize(attachment.size)}</span>
      </span>
      <span className="cell-msg-file-cta">Download</span>
    </button>
  );
}

function ReportAttachmentCard({ attachment, onOpen }) {
  if (!attachment || attachment.type !== "session_report") return null;
  return (
    <button
      type="button"
      className="cell-msg-report-card"
      onClick={() => onOpen?.(attachment)}
    >
      <span className="cell-msg-report-icon" aria-hidden>PDF</span>
      <span className="cell-msg-report-copy">
        <span className="cell-msg-report-title">Session Report</span>
        <span className="cell-msg-report-meta">
          {attachment.engineName} · {attachment.statusText}
        </span>
        <span className="cell-msg-report-sub">
          {attachment.totalReadings ?? 0} readings · {attachment.leakCount ?? 0} leaks
        </span>
      </span>
      <span className="cell-msg-report-cta">View</span>
    </button>
  );
}

export default function CellMessagingPanel({
  role,
  threadId,
  threadLabel = "Chat",
  isGroup = false,
  messages,
  onSend,
  onAttachFile,
  onOpenReport,
  unreadCount = 0,
  fullPage = false,
  hideHeader = false,
  whatsappStyle = false,
  displayNameFor = (from) => from,
}) {
  const [draft, setDraft] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [attachError, setAttachError] = useState("");
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const hasDraft = draft.trim().length > 0;

  const handleVoiceTranscript = (text) => {
    const t = text.trim();
    if (!t) return;
    setDraft((prev) => (prev ? `${prev} ${t}` : t));
  };

  const {
    supported: voiceSupported,
    listening: voiceListening,
    toggleListening,
  } = useAriaVoice({ onFinalTranscript: handleVoiceTranscript });

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttachFile) return;
    setAttachError("");
    try {
      await onAttachFile(file);
    } catch (err) {
      setAttachError(err?.message || "Could not attach file.");
    }
  };

  return (
    <div className={`cell-messaging liquid-glass-card ${fullPage ? "cell-messaging--full" : ""} ${whatsappStyle ? "cell-messaging--wa" : ""}`}>
      <div className="cell-messaging-liquid-bg" aria-hidden>
        <span className="cell-messaging-orb cell-messaging-orb-1" />
        <span className="cell-messaging-orb cell-messaging-orb-2" />
      </div>

      {!hideHeader && (
        <div className="cell-messaging-header">
          <div className="cell-messaging-header-icon" aria-hidden>💬</div>
          <div className="cell-messaging-header-copy">
            <h3 className="cell-messaging-title">{threadLabel}</h3>
            <p className="cell-messaging-sub">
              {isGroup ? "Group · all cell members" : "Private thread"}
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="cell-messaging-unread">{unreadCount} new</span>
          )}
        </div>
      )}

      {whatsappStyle && (
        <div className="cell-messaging-wa-header">
          <h3 className="cell-messaging-title cell-messaging-wa-header__title">{threadLabel}</h3>
        </div>
      )}

      <div ref={threadRef} className="cell-messaging-thread">
        {messages.length === 0 && (
          <div className="cell-messaging-empty">
            <p>No messages yet</p>
            <span>Messages here are only visible to participants in this thread.</span>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.from === role;
          const senderName = displayNameFor(m.from);
          return (
            <div
              key={m.id}
              className={`cell-msg ${mine ? "cell-msg--mine" : "cell-msg--peer"} ${whatsappStyle ? "cell-msg--wa" : ""}`}
            >
              <div className="cell-msg-inner">
                <div className="cell-msg-meta">
                  <span className="cell-msg-role">{senderName}</span>
                  <span className="cell-msg-time">{fmtTime(m.ts)}</span>
                </div>
                {m.attachment?.type === "session_report" ? (
                  <ReportAttachmentCard attachment={m.attachment} onOpen={onOpenReport} />
                ) : m.attachment?.type === "file" ? (
                  <FileAttachmentCard attachment={m.attachment} />
                ) : (
                  <p className="cell-msg-text">{m.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form className={`cell-messaging-compose ${whatsappStyle ? "cell-messaging-compose--wa" : ""}`} onSubmit={handleSubmit}>
        <div className={`cell-messaging-compose-bar ${whatsappStyle ? "cell-messaging-compose-bar--wa" : ""}`}>
          {onAttachFile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="cell-messaging-file-input"
                accept={CHAT_FILE_ACCEPT}
                onChange={handleFilePick}
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                className="cell-messaging-action-btn cell-messaging-action-btn--attach"
                onClick={() => fileInputRef.current?.click()}
                title="Attach a file from your computer"
                aria-label="Attach a file from your computer"
              >
                {whatsappStyle ? <IconPlus /> : <IconAttach />}
              </button>
            </>
          )}

          <div className={`cell-messaging-input-shell ${inputFocused ? "focused" : ""} ${hasDraft ? "has-draft" : ""}`}>
            <textarea
              className="cell-messaging-input cell-messaging-textarea"
              placeholder={voiceListening ? "Listening…" : `Message ${threadLabel}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              maxLength={500}
              rows={1}
              aria-label={`Message ${threadLabel}`}
            />
            {!whatsappStyle && (
              <span className="cell-messaging-char">{draft.length}/500</span>
            )}
          </div>

          {whatsappStyle ? (
            hasDraft ? (
              <button
                type="submit"
                className="cell-messaging-action-btn cell-messaging-action-btn--send-round cell-messaging-send--ready"
                aria-label="Send message"
              >
                <IconSend />
              </button>
            ) : voiceSupported.stt ? (
              <button
                type="button"
                className={`cell-messaging-action-btn cell-messaging-action-btn--mic ${voiceListening ? "cell-messaging-action-btn--active" : ""}`}
                onClick={toggleListening}
                title={voiceListening ? "Stop voice input" : "Voice input"}
                aria-pressed={voiceListening}
                aria-label={voiceListening ? "Stop voice input" : "Voice input"}
              >
                <IconMic active={voiceListening} />
              </button>
            ) : null
          ) : (
            <>
              {voiceSupported.stt && (
                <button
                  type="button"
                  className={`cell-messaging-action-btn ${voiceListening ? "cell-messaging-action-btn--active" : ""}`}
                  onClick={toggleListening}
                  title={voiceListening ? "Stop voice input" : "Voice input"}
                  aria-pressed={voiceListening}
                  aria-label={voiceListening ? "Stop voice input" : "Voice input"}
                >
                  <IconMic active={voiceListening} />
                </button>
              )}
              <button
                type="submit"
                className={`cell-messaging-send cell-messaging-send--icon ${hasDraft ? "cell-messaging-send--ready" : ""}`}
                disabled={!hasDraft}
                aria-label="Send message"
              >
                <span className="cell-messaging-send-label">Send</span>
                <span className="cell-messaging-send-glow" aria-hidden />
              </button>
            </>
          )}
        </div>
        {attachError && <p className="cell-messaging-attach-error" role="alert">{attachError}</p>}
      </form>
    </div>
  );
}
