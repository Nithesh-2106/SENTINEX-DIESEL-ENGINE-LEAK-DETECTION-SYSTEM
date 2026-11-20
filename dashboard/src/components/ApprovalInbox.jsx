import React, { useState } from "react";
import { createPortal } from "react-dom";
import { fmtRequestTs, modeLabel, RequestDetailsPanel } from "./RequestDetailsBreakdown.jsx";
import { isHeadRole, isTesterRole } from "../utils/testerRegistry.js";

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return "—";
  }
}

function statusClass(status) {
  if (status === "pending") return "approval-strip-badge--pending";
  if (status === "approved") return "approval-strip-badge--approved";
  if (status === "rejected") return "approval-strip-badge--rejected";
  return "approval-strip-badge--muted";
}

function RequestInfoModal({ request, onClose }) {
  if (!request) return null;

  return createPortal(
    <div className="req-info-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="req-info-popover liquid-glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="req-info-popover-header">
          <div>
            <p className="req-info-popover-eyebrow">Change request</p>
            <h4 className="req-info-popover-title">{request.status?.toUpperCase()}</h4>
          </div>
          <button type="button" className="req-info-popover-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="req-info-popover-body">
          <RequestDetailsPanel request={request} />
        </div>
        <div className="req-info-popover-footer">
          <button type="button" className="req-info-popover-done" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RequestStripCard({
  request,
  role,
  highlightRequestId,
  onApprove,
  onReject,
  onInfo,
}) {
  const mode = modeLabel(request);
  const isPending = request.status === "pending";
  const sp = `${Number(request.to.rpm).toFixed(0)} / ${Number(request.to.load).toFixed(0)}% / ${Number(request.to.p).toFixed(1)} kPa`;
  const when = isPending ? fmtTs(request.createdAt) : fmtRequestTs(request.decidedAt || request.createdAt);

  return (
    <div
      data-request-id={request.id}
      className={`approval-strip-card ${highlightRequestId === request.id ? "approval-request-highlight" : ""} approval-strip-card--${request.status}`}
    >
      <div className="approval-strip-card-row">
        <span className={`approval-strip-badge ${statusClass(request.status)}`}>
          {request.status}
        </span>
        <span className="approval-strip-sp">{sp}</span>
        <span className="approval-strip-mode">{mode}</span>
        <span className="approval-strip-meta">{request.requestedByName || request.requestedBy || "—"} · {request.reason || "—"}</span>
        <span className="approval-strip-time">{when}</span>

        <button
          type="button"
          className="approval-strip-info"
          onClick={() => onInfo(request)}
          aria-label="View request details"
          title="Details"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
            <path strokeLinecap="round" strokeWidth="1.75" d="M12 10v6M12 7h.01" />
          </svg>
        </button>

        {isPending && isHeadRole(role) && (
          <div className="approval-strip-actions">
            <button type="button" className="approval-strip-btn approval-strip-btn--reject" onClick={() => onReject(request.id)}>
              Reject
            </button>
            <button type="button" className="approval-strip-btn approval-strip-btn--approve" onClick={() => onApprove(request.id)}>
              Approve
            </button>
          </div>
        )}
        {isPending && isTesterRole(role) && request.requestedBy === role && (
          <span className="approval-strip-wait">Awaiting head…</span>
        )}
      </div>

      {request.rejectionReason && (
        <p className="approval-strip-reject">{request.rejectionReason}</p>
      )}
    </div>
  );
}

export default function ApprovalInbox({ requests, role, onApprove, onReject, highlightRequestId = null }) {
  const [infoRequest, setInfoRequest] = useState(null);
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending").slice(0, 12);
  const all = [...pending, ...history];

  return (
    <div className="approval-inbox approval-inbox--minimal">
      <div className="approval-inbox-header approval-inbox-header--minimal">
        <span className="approval-inbox-title">Change Requests</span>
        <span className="approval-pending-badge">Pending · {pending.length}</span>
      </div>

      {all.length === 0 ? (
        <div className="approval-strip-empty">No change requests yet.</div>
      ) : (
        <div className="approval-strip approval-strip--wrap">
          {all.map((r) => (
            <RequestStripCard
              key={r.id}
              request={r}
              role={role}
              highlightRequestId={highlightRequestId}
              onApprove={onApprove}
              onReject={onReject}
              onInfo={setInfoRequest}
            />
          ))}
        </div>
      )}

      {infoRequest && (
        <RequestInfoModal request={infoRequest} onClose={() => setInfoRequest(null)} />
      )}
    </div>
  );
}
