import React from "react";
import { modeLabel, fmtRequestTs, RequestDetailsDropdown } from "./RequestDetailsBreakdown.jsx";

const VARIANT_COPY = {
  pending: {
    eyebrow: "Test Head · Action required",
    title: "New change request",
    badge: "PENDING",
    cta: "Review & Approve",
  },
  submitted: {
    eyebrow: "Request submitted",
    title: "Awaiting approval",
    badge: "SENT",
    cta: "View inbox",
  },
  approved: {
    eyebrow: "Decision received",
    title: "Approved",
    badge: "APPROVED",
    cta: "Open inbox",
  },
  rejected: {
    eyebrow: "Decision received",
    title: "Rejected",
    badge: "REJECTED",
    cta: "Open inbox",
  },
  peer_pending: {
    eyebrow: "Another tester · Change request",
    title: "Peer request pending",
    badge: "PEER",
    cta: "View inbox",
  },
  peer_decided: {
    eyebrow: "Cell decision",
    title: "Request decided",
    badge: "UPDATE",
    cta: "View inbox",
  },
};

function buildSummary(request, variant) {
  const mode = modeLabel(request);
  const target = `${Number(request.to.rpm).toFixed(0)} RPM / ${Number(request.to.load).toFixed(0)}% / ${Number(request.to.p).toFixed(1)} kPa`;

  if (variant === "pending") {
    return (
      <>
        <strong>{request.requestedByName || request.requestedBy || "Tester"}</strong> →{" "}
        <span className="cr-alert-highlight">{target}</span> ({mode})
      </>
    );
  }
  if (variant === "submitted") {
    return (
      <>
        Change request sent at{" "}
        <span className="cr-alert-highlight">{fmtRequestTs(request.createdAt)}</span>
        {" "}→ <span className="cr-alert-highlight">{target}</span>
      </>
    );
  }
  if (variant === "approved") {
    return (
      <>
        Head approved <span className="cr-alert-highlight">{target}</span> ({mode})
      </>
    );
  }
  if (variant === "peer_pending") {
    return (
      <>
        <strong>{request.requestedByName || request.requestedBy || "Tester"}</strong> submitted{" "}
        <span className="cr-alert-highlight">{target}</span> ({mode})
      </>
    );
  }
  if (variant === "peer_decided") {
    const verb = request.status === "approved" ? "approved" : "rejected";
    return (
      <>
        Head {verb} <strong>{request.requestedByName || request.requestedBy}</strong>&apos;s request →{" "}
        <span className="cr-alert-highlight">{target}</span>
      </>
    );
  }
  if (variant === "rejected") {
    return (
      <>
        Head rejected change to{" "}
        <span className="cr-alert-highlight">
          {Number(request.to.rpm).toFixed(0)} RPM / {Number(request.to.load).toFixed(0)}%
        </span>
        {request.rejectionReason && (
          <> — <span className="cr-alert-reject-reason">{request.rejectionReason}</span></>
        )}
      </>
    );
  }
  return null;
}

export default function ChangeRequestAlert({
  request,
  variant = "pending",
  onNavigate,
  onDismiss,
  index = 0,
  alertKey,
}) {
  if (!request) return null;

  const compact = variant === "approved" || variant === "rejected" || variant === "submitted"
    || variant === "peer_pending" || variant === "peer_decided";
  const copy = VARIANT_COPY[variant] || VARIANT_COPY.pending;
  const dismissKey = alertKey || alertKeyForFallback(request, variant);

  const handleNavigate = () => onNavigate?.(request.id);

  return (
    <div
      className={`cr-alert-popup cr-alert-popup--${variant} ${compact ? "cr-alert-popup--compact" : ""}`}
      style={{ "--cr-alert-offset": `${index * 8}px` }}
      role="alertdialog"
      aria-labelledby={`cr-alert-title-${request.id}`}
    >
      <div className="cr-alert-liquid-orb cr-alert-liquid-orb-1" aria-hidden />
      <div className="cr-alert-liquid-orb cr-alert-liquid-orb-2" aria-hidden />
      <div className="cr-alert-glow" aria-hidden />

      <button
        type="button"
        className="cr-alert-dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss?.(dismissKey);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>

      <div className={`cr-alert-body cr-alert-body--${variant}`}>
        <div className="cr-alert-content-scrim" aria-hidden />
        <div className="cr-alert-content">
          <div className="cr-alert-header">
            <span className="cr-alert-pulse-dot" aria-hidden />
            <div className="cr-alert-header-copy">
              <p className="cr-alert-eyebrow">{copy.eyebrow}</p>
              <h3 id={`cr-alert-title-${request.id}`} className="cr-alert-title">
                {copy.title}
              </h3>
            </div>
            <span className="cr-alert-badge">{copy.badge}</span>
          </div>

          <p className="cr-alert-summary">{buildSummary(request, variant)}</p>

          {variant === "submitted" && (
            <div className="cr-alert-meta">
              <span>{request.reason || "—"}</span>
              <span className="cr-alert-meta-sep">·</span>
              <span>Pending Test Head review</span>
            </div>
          )}

          {!compact && variant === "pending" && (
            <div className="cr-alert-meta">
              <span>{request.reason || "—"}</span>
              <span className="cr-alert-meta-sep">·</span>
              <span>{fmtRequestTs(request.createdAt)}</span>
            </div>
          )}

          {variant === "rejected" && request.rejectionReason && (
            <div className="cr-alert-reject-box">
              <span className="cr-alert-reject-label">Rejection cause</span>
              <p>{request.rejectionReason}</p>
            </div>
          )}

          <RequestDetailsDropdown request={request} status={variant === "submitted" ? "pending" : variant} className="cr-alert-details-wrap" />

          <div className="cr-alert-actions">
            <button type="button" className="cr-alert-cta-btn" onClick={handleNavigate}>
              {copy.cta}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function alertKeyForFallback(request, variant) {
  if (variant === "submitted") return `${request.id}:submitted`;
  if (variant === "pending") return request.id;
  return `${request.id}:${variant}`;
}
