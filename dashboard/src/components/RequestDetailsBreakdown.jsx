import React, { useState } from "react";

export function fmtRequestTs(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      hour12: false,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function modeLabel(request) {
  return request.mode === "ramp" ? `RAMP · ${request.rampSeconds}s` : "STEP";
}

export function RequestDetailsPanel({ request, status }) {
  const mode = modeLabel(request);
  const rows = [
    ["Request ID", request.id],
    ["Status", (status || request.status || "pending").toUpperCase()],
    ["Requested by", request.requestedByName || request.requestedBy || "tester"],
    request.decidedBy ? ["Decided by", request.decidedBy] : null,
    ["Change mode", mode],
    [
      "Current setpoints",
      `${Number(request.from.rpm).toFixed(0)} RPM · ${Number(request.from.load).toFixed(0)}% · ${Number(request.from.p).toFixed(1)} kPa`,
    ],
    [
      "Target setpoints",
      `${Number(request.to.rpm).toFixed(0)} RPM · ${Number(request.to.load).toFixed(0)}% · ${Number(request.to.p).toFixed(1)} kPa`,
    ],
    ["Δ RPM", `${(Number(request.to.rpm) - Number(request.from.rpm)).toFixed(0)}`],
    ["Δ Load", `${(Number(request.to.load) - Number(request.from.load)).toFixed(1)}%`],
    ["Δ Ambient P", `${(Number(request.to.p) - Number(request.from.p)).toFixed(2)} kPa`],
    ["Reason", request.reason || "—"],
    ["Submitted", fmtRequestTs(request.createdAt)],
    request.decidedAt ? ["Decided", fmtRequestTs(request.decidedAt)] : null,
    request.rejectionReason ? ["Rejection cause", request.rejectionReason] : null,
  ].filter(Boolean);

  return (
    <div className="req-details-panel">
      {rows.map(([label, value]) => (
        <div key={label} className="req-details-row">
          <span className="req-details-label">{label}</span>
          <span className="req-details-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function RequestDetailsDropdown({ request, status, className = "", defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className={`req-details-dropdown ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`req-details-toggle ${expanded ? "expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>Detailed breakdown</span>
        <svg className="req-details-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <RequestDetailsPanel request={request} status={status} />}
    </div>
  );
}
