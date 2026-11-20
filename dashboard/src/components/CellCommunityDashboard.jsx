import React from "react";
import { isHeadRole, isTesterRole } from "../utils/testerRegistry.js";
import { getTesterBayTone } from "../utils/testerBayTone.js";
import TesterBayPanel from "./TesterBayPanel.jsx";

export default function CellCommunityDashboard({
  role,
  boardTesters = [],
  onMirrorTester,
}) {
  const bays = boardTesters.filter((t) => isTesterRole(t.id));
  const onlineCount = bays.filter((t) => t.online).length;
  const leakCount = bays.filter((t) => getTesterBayTone(t) === "leak").length;
  const faultCount = bays.filter((t) => getTesterBayTone(t) === "sensorFault").length;

  return (
    <div className="cell-community-page">
      <div className="cell-community-hero liquid-glass-panel">
        <div className="cell-community-hero__content">
          <p className="cell-community-eyebrow">Test Cell TC-03 · Parallel bays</p>
          <h2 className="cell-community-title">Cell Community Dashboard</h2>
          <p className="cell-community-desc">
            Live status for every tester bay — {isHeadRole(role) ? "supervisor view" : "shared cell visibility"}.
          </p>
        </div>
        <div className="cell-community-hero__stats">
          <div className="cell-community-stat">
            <span className="cell-community-stat__val">{onlineCount}/{bays.length}</span>
            <span className="cell-community-stat__lbl">Online</span>
          </div>
          <div className={`cell-community-stat ${leakCount ? "cell-community-stat--alert" : ""}`}>
            <span className="cell-community-stat__val">{leakCount}</span>
            <span className="cell-community-stat__lbl">Leaks</span>
          </div>
          <div className={`cell-community-stat ${faultCount ? "cell-community-stat--fault" : ""}`}>
            <span className="cell-community-stat__val">{faultCount}</span>
            <span className="cell-community-stat__lbl">Sensor faults</span>
          </div>
        </div>
      </div>

      <div className="cell-community-legend" aria-label="Panel color legend">
        <span className="cell-community-legend__item cell-community-legend__item--leak">Leak</span>
        <span className="cell-community-legend__item cell-community-legend__item--sensor-fault">Sensor fault</span>
        <span className="cell-community-legend__item cell-community-legend__item--normal">Normal</span>
        <span className="cell-community-legend__item cell-community-legend__item--steady">Steady / ready</span>
        <span className="cell-community-legend__item cell-community-legend__item--transitioning">Transitioning</span>
        <span className="cell-community-legend__item cell-community-legend__item--offline">Offline</span>
      </div>

      <div className="cell-bay-grid">
        {bays.map((t) => (
          <TesterBayPanel
            key={t.id}
            tester={t}
            role={role}
            onMirror={onMirrorTester}
          />
        ))}
      </div>

      {bays.length === 0 && (
        <p className="cell-community-empty">No tester bays configured.</p>
      )}
    </div>
  );
}
