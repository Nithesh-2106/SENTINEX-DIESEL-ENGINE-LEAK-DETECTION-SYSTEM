import React from "react";
import { createPortal } from "react-dom";

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function CommsMessageToast({ message, onOpen, onDismiss }) {
  if (!message) return null;

  const fromLabel = message.from === "head" ? "Test Head" : "Tester";
  const preview = message.text?.length > 96 ? `${message.text.slice(0, 96)}…` : message.text;

  return createPortal(
    <div className="comms-toast-stack" role="alert" aria-live="polite">
      <button type="button" className="comms-toast" onClick={() => onOpen?.(message)}>
        <span className="comms-toast-avatar">{message.from === "head" ? "H" : "T"}</span>
        <span className="comms-toast-body">
          <span className="comms-toast-top">
            <span className="comms-toast-label">New Ops Chat message</span>
            <span className="comms-toast-time">{fmtTime(message.ts)}</span>
          </span>
          <span className="comms-toast-from">{fromLabel}</span>
          <span className="comms-toast-text">{preview}</span>
          <span className="comms-toast-hint">Click to open Ops Chat</span>
        </span>
      </button>
      <button
        type="button"
        className="comms-toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss?.(message.id);
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>,
    document.body
  );
}
