import React, { useState } from "react";
import DisturbanceControls from "./DisturbanceControls.jsx";
import OperatingPointBar from "./OperatingPointBar.jsx";
import AuditLog from "./AuditLog.jsx";
import ApprovalInbox from "./ApprovalInbox.jsx";
import NotificationFeed from "./NotificationFeed.jsx";
import RejectRequestModal from "./RejectRequestModal.jsx";
import TesterManagementPanel from "./TesterManagementPanel.jsx";
import { TesterLiveBoard } from "./CellActivityPanel.jsx";
import { getTesterDisplayName, isHeadRole } from "../utils/testerRegistry.js";

export default function OperationsPanel({
  role,
  liveTesters = [],
  boardTesters = [],
  headViewingTester = null,
  headApplyTargets = [],
  onHeadApplyTargetsChange,
  onHeadViewTester,
  targetRpm,
  targetLoad,
  targetAmbientPressure,
  disturbanceMode,
  rampSeconds,
  changeReason,
  onReasonChange,
  onRpmChange,
  onLoadChange,
  onAmbientPressureChange,
  onModeChange,
  onRampSecondsChange,
  onReturnSteady,
  onRequestChange,
  onApplyChange,
  requests,
  auditEvents,
  notifications,
  onApprove,
  onReject,
  highlightRequestId,
  isStreaming = false,
  opRpm,
  opLoad,
  opAmbientPressure,
  spRpm,
  spLoad,
  spAmbient,
}) {
  const [rejectTarget, setRejectTarget] = useState(null);
  const [registryTick, setRegistryTick] = useState(0);

  const handleRejectClick = (id) => {
    const req = requests.find((r) => r.id === id);
    if (req) setRejectTarget(req);
  };

  const handleRejectConfirm = (reason) => {
    if (rejectTarget) {
      onReject(rejectTarget.id, reason);
      setRejectTarget(null);
    }
  };

  const roleLabel = isHeadRole(role) ? "Test Head" : getTesterDisplayName(role);

  return (
    <div className="operations-page">
      <div className="operations-sticky">
        <div className="operations-hero liquid-glass-panel">
          <div className="operations-hero-liquid" aria-hidden>
            <span className="operations-hero-orb operations-hero-orb-1" />
            <span className="operations-hero-orb operations-hero-orb-2" />
          </div>
          <div className="operations-hero-content">
            <p className="operations-eyebrow">Test Cell · Parallel consoles</p>
            <h2 className="operations-title">Cell Operations</h2>
            <p className="operations-desc">
              Manual disturbances, change requests, audit trail, and ops notifications across all tester bays.
            </p>
          </div>
          <span className={`operations-role-pill operations-role-pill--${isHeadRole(role) ? "head" : "tester"}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      <div className="operations-scroll">
        {isHeadRole(role) && (
          <div className="ops-tester-mgmt-row">
            <TesterManagementPanel
              role={role}
              onRegistryChange={() => setRegistryTick((n) => n + 1)}
            />
            <div className="section-card compact tester-live-board-wrap liquid-glass-card">
              <div className="section-card-header">
                <span className="section-card-title">LIVE TESTER TRANSPARENCY</span>
              </div>
              <div className="section-card-body flush">
                <TesterLiveBoard
                  liveTesters={liveTesters}
                  selectedId={headViewingTester}
                  onSelect={(id) => {
                    onHeadViewTester?.(id);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="operations-controls-wrap liquid-glass-card" id="head-manual-disturbance-panel">
          <DisturbanceControls
            rpm={targetRpm}
            load={targetLoad}
            ambientPressure={targetAmbientPressure}
            mode={disturbanceMode}
            rampSeconds={rampSeconds}
            reason={changeReason}
            onReasonChange={onReasonChange}
            onRpmChange={onRpmChange}
            onLoadChange={onLoadChange}
            onAmbientPressureChange={onAmbientPressureChange}
            onModeChange={onModeChange}
            onRampSecondsChange={onRampSecondsChange}
            onReturnSteady={onReturnSteady}
            onRequestChange={onRequestChange}
            onApplyChange={onApplyChange}
            role={role}
            disabled={false}
            wide
            liveTesters={boardTesters.length ? boardTesters : liveTesters}
            applyTargets={headApplyTargets}
            onApplyTargetsChange={onHeadApplyTargetsChange}
            actRpm={opRpm}
            actLoad={opLoad}
            actAmbient={opAmbientPressure}
            isStreaming={isStreaming}
          />
        </div>

        <OperatingPointBar
          isStreaming={isStreaming}
          opRpm={opRpm}
          opLoad={opLoad}
          opAmbientPressure={opAmbientPressure}
          spRpm={spRpm}
          spLoad={spLoad}
          spAmbient={spAmbient}
          className="operations-operating-point"
        />

        <div className="ops-bottom-row">
          <div className="section-card liquid-glass-card ops-bottom-cell">
            <div className="section-card-header">
              <span className="section-card-title">AUDIT LOG</span>
            </div>
            <div className="section-card-body ops-bottom-scroll">
              <AuditLog events={auditEvents} compact />
            </div>
          </div>
          <div className="section-card liquid-glass-card ops-bottom-cell">
            <div className="section-card-header">
              <span className="section-card-title">OPS NOTIFICATIONS</span>
            </div>
            <div className="section-card-body ops-bottom-scroll flush">
              <NotificationFeed items={notifications} embedded />
            </div>
          </div>
        </div>

        <div className="section-card liquid-glass-card operations-requests-card" id="change-requests-panel">
          <ApprovalInbox
            requests={requests}
            role={role}
            onApprove={onApprove}
            onReject={handleRejectClick}
            highlightRequestId={highlightRequestId}
          />
        </div>
      </div>

      {rejectTarget && (
        <RejectRequestModal
          request={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
