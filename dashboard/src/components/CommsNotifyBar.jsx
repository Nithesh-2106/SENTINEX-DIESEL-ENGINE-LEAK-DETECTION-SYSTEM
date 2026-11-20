import React from "react";
import { createPortal } from "react-dom";
import { displayNameForMessage } from "../utils/cellChat.js";

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/** Persistent ops chat notification — does not auto-navigate. */
export default function CommsNotifyBar({ message, onOpen, onDismiss }) {
  if (!message) return null;

  const fromLabel = displayNameForMessage(message.from);
  const preview = message.text?.length > 120 ? `${message.text.slice(0, 120)}…` : message.text;

  return createPortal(
    <div className="comms-notify-bar" role="alert" aria-live="polite">
      <div className="comms-notify-bar-glow" aria-hidden />
      <span className="comms-notify-bar-avatar">{message.from === "head" ? "H" : "T"}</span>
      <div className="comms-notify-bar-body">
        <span className="comms-notify-bar-label">New Ops Chat message</span>
        <span className="comms-notify-bar-line">
          <strong>{fromLabel}</strong>
          <span className="comms-notify-bar-sep">·</span>
          <span className="comms-notify-bar-preview">{preview}</span>
          <span className="comms-notify-bar-time">{fmtTime(message.ts)}</span>
        </span>
      </div>
      <div className="comms-notify-bar-actions">
        <button type="button" className="comms-notify-bar-open" onClick={() => onOpen?.(message)}>
          Open Ops Chat
        </button>
        <button
          type="button"
          className="comms-notify-bar-dismiss"
          onClick={() => onDismiss?.(message.id)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}
