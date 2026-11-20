import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTesterAccount,
  getTesterBayId,
  getTesterDisplayName,
  loadTesterRegistry,
  TEST_CELL_ID,
} from "../utils/testerRegistry.js";
import { ENGINE_DISPLAY, SCENARIO_LABELS } from "../simulator.js";
import { formatDuration } from "../utils/generatePdf.js";
import TesterAccountPanel from "./TesterAccountPanel.jsx";

const TAB_LABELS = {
  dashboard: "Dashboard",
  operations: "Cell Ops",
  digitaltwin: "Digital Twin",
  sensorhealth: "Sensor Health",
  comms: "Ops Chat",
  cellboard: "Cell Board",
  federated: "Federated Learning",
  chat: "ARIA",
  account: "My Account",
};

function InfoCard({ title, children, className = "" }) {
  return (
    <section className={`tester-account-dash-card liquid-glass-card ${className}`}>
      <h3 className="tester-account-dash-card__title">{title}</h3>
      <div className="tester-account-dash-card__body">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, mono = false, accent }) {
  return (
    <div className="tester-account-dash-row">
      <span className="tester-account-dash-row__label">{label}</span>
      <span
        className={`tester-account-dash-row__value ${mono ? "tester-account-dash-row__value--mono" : ""}`}
        style={accent ? { color: accent } : undefined}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function TesterAccountDashboard({
  role,
  onBack,
  onRegistryChange,
  activeEngine,
  activeScenario,
  isStreaming,
  readingCount,
  apiOnline,
  returnTab = "dashboard",
  sessionLog,
  opRpm,
  opLoad,
  opAmbientPressure,
}) {
  if (!role) return null;

  const registry = loadTesterRegistry();
  const account = getTesterAccount(role, registry);
  const displayName = getTesterDisplayName(role, registry);
  const bayId = getTesterBayId(role, registry);
  const engineLabel = ENGINE_DISPLAY[activeEngine] || activeEngine || "—";
  const scenarioLabel = SCENARIO_LABELS[activeScenario] || activeScenario || "Normal";
  const tabLabel = TAB_LABELS[returnTab] || returnTab || "—";
  const sessionDuration = sessionLog?.startTime
    ? formatDuration(sessionLog.startTime, sessionLog.endTime || new Date())
    : "—";
  const leakCount = sessionLog?.leakEvents?.length || 0;

  return (
    <div className="tester-account-page">
      <div className="tester-account-page__inner liquid-glass-panel">
        <header className="tester-account-dashboard__header tester-account-page__header">
          <div className="tester-account-dashboard__header-copy">
            <span className="tester-account-dashboard__eyebrow">SENTINEX · Tester console</span>
            <h1 className="tester-account-dashboard__title">My Account</h1>
            <p className="tester-account-dashboard__desc">
              Bay profile, live console status, and login credentials for this workstation.
            </p>
          </div>
          <button
            type="button"
            className="tester-account-dashboard__close"
            onClick={onBack}
            aria-label="Close account dashboard"
          >
            ×
          </button>
        </header>

        <div className="tester-account-dashboard__scroll tester-account-page__body">
          <div className="tester-account-dashboard__hero">
            <div className="tester-account-dashboard__avatar" aria-hidden>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="tester-account-dashboard__hero-name">{displayName}</div>
              <div className="tester-account-dashboard__hero-meta">
                {bayId ? `Bay ${bayId}` : `Cell ${TEST_CELL_ID}`} · {account?.builtin ? "Built-in bay" : "Custom bay"}
              </div>
            </div>
            <div className={`tester-account-dashboard__status-pill ${isStreaming ? "live" : "idle"}`}>
              {isStreaming ? "STREAMING" : "IDLE"}
            </div>
          </div>

          <div className="tester-account-dashboard__grid">
            <InfoCard title="Bay profile">
              <InfoRow label="Display name" value={displayName} />
              <InfoRow label="Bay ID" value={bayId} mono />
              <InfoRow label="Test cell" value={TEST_CELL_ID} mono />
              <InfoRow label="Console ID" value={role} mono />
              <InfoRow label="Account type" value={account?.builtin ? "Built-in" : "Custom"} />
              <p className="tester-account-dash-inline-note">
                Display name is assigned by the test head and cannot be changed here.
              </p>
            </InfoCard>

            <InfoCard title="Live console">
              <InfoRow label="Return view" value={tabLabel} />
              <InfoRow label="Engine" value={engineLabel} />
              <InfoRow label="Scenario" value={scenarioLabel} />
              <InfoRow
                label="Stream"
                value={isStreaming ? "Live" : "Paused"}
                accent={isStreaming ? "var(--color-normal)" : "var(--color-warn)"}
              />
              <InfoRow label="Reading #" value={String(readingCount ?? 0)} mono />
              <InfoRow
                label="API"
                value={apiOnline ? "Online" : "Offline / demo"}
                accent={apiOnline ? "var(--color-normal)" : "var(--color-leak)"}
              />
              <InfoRow label="RPM (actual)" value={opRpm != null ? `${Math.round(opRpm)}` : "—"} mono />
              <InfoRow label="Load (actual)" value={opLoad != null ? `${Math.round(opLoad)}%` : "—"} mono />
              <InfoRow
                label="Ambient"
                value={opAmbientPressure != null ? `${opAmbientPressure.toFixed(1)} kPa` : "—"}
                mono
              />
            </InfoCard>

            <InfoCard title="Session">
              <InfoRow label="Session ID" value={sessionLog?.sessionId} mono />
              <InfoRow label="Engine serial" value={sessionLog?.engineSerial} mono />
              <InfoRow label="Duration" value={sessionDuration} />
              <InfoRow label="Total readings" value={String(sessionLog?.totalReadings ?? 0)} mono />
              <InfoRow
                label="Leak events"
                value={String(leakCount)}
                accent={leakCount > 0 ? "var(--color-leak)" : undefined}
              />
              <InfoRow label="Sensor faults" value={String(sessionLog?.sensorFaults?.length || 0)} mono />
            </InfoCard>

            <InfoCard title="Login credentials" className="tester-account-dashboard__credentials">
              <p className="tester-account-dash-credentials-note">
                Username and password are shown below. Bay display name is assigned by the test head.
                Enter your current password to save any changes.
              </p>
              {account && (
                <div className="tester-account-dash-current-creds">
                  <InfoRow label="Current username" value={account.username} mono />
                  <InfoRow label="Current password" value={account.password || "—"} mono />
                </div>
              )}
              <TesterAccountPanel
                role={role}
                embedded
                dashboard
                onRegistryChange={onRegistryChange}
              />
            </InfoCard>
          </div>
        </div>
      </div>
    </div>
  );
}
