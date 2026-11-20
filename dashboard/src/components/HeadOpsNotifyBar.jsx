import React from "react";
import { createPortal } from "react-dom";

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function HeadOpsNotifyBar({ event, onOpen, onDismiss }) {
  if (!event) return null;

  const label = event.type === "steady" ? "Return to steady" : "Manual setpoint change";
  const targetLabel = event.targetNames || (event.targets?.length
    ? event.targets.join(", ")
    : "all testers");

  return createPortal(
    <div className="head-ops-notify-bar head-ops-notify-bar--broadcast" role="alert" aria-live="polite">
      <span className="head-ops-notify-bar-icon">H</span>
      <div className="head-ops-notify-bar-body">
        <span className="head-ops-notify-bar-label">
          Test Head · Manual cell change — directed to {targetLabel}
        </span>
        <span className="head-ops-notify-bar-line">
          <strong>{label}</strong>
          <span className="head-ops-notify-bar-sep">·</span>
          <span>{event.message}</span>
          <span className="head-ops-notify-bar-time">{fmtTime(event.ts)}</span>
        </span>
      </div>
      <div className="head-ops-notify-bar-actions">
        <button type="button" className="head-ops-notify-bar-open" onClick={() => onOpen?.(event)}>
          View in Cell Ops
        </button>
        <button
          type="button"
          className="head-ops-notify-bar-dismiss"
          onClick={() => onDismiss?.(event.id)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}
