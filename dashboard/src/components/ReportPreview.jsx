import React, { useState } from "react";
import ProductBrandLockup from "./ProductBrandLockup.jsx";
import ReportEmailDialog from "./ReportEmailDialog.jsx";
import {
  formatDuration,
  formatTime,
  getOverallStatus,
} from "../utils/generatePdf.js";
import { MULTI_LEAK_SCENARIOS, SCENARIO_LABELS } from "../simulator.js";
import { countEventsInSegment, countLeakLocationsInSegment, countTotalLeakLocations, summarizeScenarioValidation } from "../utils/sessionReport.js";
import { formatModelAccuracy } from "../utils/modelSelection.js";
import { getTesterDisplayName } from "../utils/testerRegistry.js";

function StatBox({ value, label, accentClass }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
      <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
    </div>
  );
}

function ShapBar({ deviationPct }) {
  const pct = Number(deviationPct) || 0;
  const width = Math.min(100, Math.abs(pct) * 4);
  const color = pct < 0 ? "bg-red-500" : "bg-emerald-500";
  return (
    <div className="mt-1 h-1.5 w-full max-w-[120px] rounded-full bg-gray-200">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function RcaBlock({ rca, compact = false }) {
  if (!rca?.rankedCauses?.length) return null;
  return (
    <div
      className={`rounded-lg border border-violet-200 bg-violet-50 text-xs ${
        compact ? "mt-2 p-2" : "mt-3 p-3"
      }`}
    >
      <div className="font-bold uppercase tracking-wide text-violet-900">
        Root Cause Analysis
      </div>
      {rca.shapPatternSummary && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
          {rca.shapPatternSummary}
        </p>
      )}
      {rca.cascadeExplanation && (
        <p className="mt-1 text-[11px] italic text-gray-500">{rca.cascadeExplanation}</p>
      )}
      <ul className="mt-2 space-y-1">
        {rca.rankedCauses.map((cause, idx) => (
          <li key={`${cause.label}-${idx}`} className="flex items-center justify-between gap-2">
            <span className="text-gray-800">
              <span className="font-mono text-[10px] text-violet-600">{idx + 1}.</span>{" "}
              {cause.label}
            </span>
            <span className="shrink-0 font-bold text-violet-800">{cause.probabilityPct}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{
 *   sessionLog: object;
 *   onClose: () => void;
 *   onDownload: () => void;
 * }} props
 */
export default function ReportPreview({
  sessionLog,
  role,
  onClose,
  onDownload,
  onShareToComms,
}) {
  const [shareStatus, setShareStatus] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const status = getOverallStatus(sessionLog);
  const senderName = getTesterDisplayName(role);
  const leakCount = sessionLog.leakEvents?.length || 0;
  const leakLocationTotal = countTotalLeakLocations(sessionLog);
  const faultCount = sessionLog.sensorFaults?.length || 0;
  const dqpCount = (sessionLog.dqpEvents || []).length;
  const ssgCount = (sessionLog.ssgEvents || []).length;
  const validation = summarizeScenarioValidation(sessionLog);
  const activeModelDisplay =
    sessionLog.activeModelName ||
    (sessionLog.activeModelId ? String(sessionLog.activeModelId).replace(/_/g, " ") : "—");
  const modelAccuracyDisplay =
    sessionLog.activeModelAccuracy != null
      ? formatModelAccuracy(sessionLog.activeModelAccuracy)
      : null;

  const duration = sessionLog.endTime
    ? formatDuration(sessionLog.startTime, sessionLog.endTime)
    : "In Progress";

  const handleShareCell = () => {
    if (!role || !onShareToComms) return;
    onShareToComms(sessionLog);
    setShareStatus("Opening Ops Chat — check chats to share, then tap Share.");
  };

  const handleShareEmail = () => {
    setEmailDialogOpen(true);
    setShareStatus("");
  };

  const shareBar = (
    <div className="report-share-bar">
      <div className="report-share-bar__label">Share report</div>
      <div className="report-share-bar__actions">
        <button
          type="button"
          className="report-share-btn report-share-btn--primary"
          onClick={handleShareCell}
          title="Post to Cell Group in Ops Chat and open the conversation"
        >
          Cell Ops Group
        </button>
        <button
          type="button"
          className="report-share-btn report-share-btn--email"
          onClick={handleShareEmail}
          title="Send report PDF via SMTP"
        >
          Email
        </button>
      </div>
      {shareStatus && <p className="report-share-bar__note">{shareStatus}</p>}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-preview-title"
    >
      <div className="mb-8 w-full max-w-[800px] rounded-xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-[#0D1B2A] px-6 py-4">
          <div>
            <div className="report-modal-brand">
              <ProductBrandLockup variant="header" showSentinex showSubtitle={false} />
            </div>
            <h2
              id="report-preview-title"
              className="mt-2 text-sm font-bold tracking-wide text-[#FFB800]"
            >
              TEST CELL SESSION REPORT
            </h2>
            <p className="text-xs text-gray-400">Preview before download</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShareCell}
              className="rounded-lg border border-cyan-600/50 bg-cyan-950/40 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/50"
            >
              Share to Cell Ops
            </button>
            <button
              type="button"
              onClick={handleShareEmail}
              className="rounded-lg border border-gray-500 px-3 py-2 text-xs font-bold text-gray-200 hover:bg-white/10"
            >
              Email
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="rounded-lg bg-[#FFB800] px-4 py-2 text-sm font-bold text-[#0D1B2A] hover:bg-yellow-400"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-bold text-white hover:bg-white/10"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Report body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 text-gray-800">
          {shareBar}
          {/* Section 1 — Header */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="report-brand-row">
              <ProductBrandLockup variant="report" showSentinex />
            </div>
            <div className="text-sm text-gray-600">
              Diesel Engine Leak Detection System — Test Cell Report
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-gray-500">Session ID:</span>{" "}
                <span className="font-mono font-semibold">{sessionLog.sessionId || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500">Date:</span>{" "}
                <span className="font-semibold">
                  {sessionLog.startTime
                    ? new Date(sessionLog.startTime).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Engine:</span>{" "}
                <span className="font-semibold">{sessionLog.engineName}</span>
              </div>
              <div>
                <span className="text-gray-500">Start:</span>{" "}
                <span className="font-mono">{formatTime(sessionLog.startTime)}</span>
              </div>
              <div>
                <span className="text-gray-500">Serial:</span>{" "}
                <span className="font-mono">{sessionLog.engineSerial}</span>
              </div>
              <div>
                <span className="text-gray-500">End:</span>{" "}
                <span className="font-mono">{formatTime(sessionLog.endTime)}</span>
              </div>
              <div>
                <span className="text-gray-500">Test Cell:</span>{" "}
                <span className="font-mono">{sessionLog.testCellId}</span>
              </div>
              <div>
                <span className="text-gray-500">Duration:</span>{" "}
                <span className="font-mono">{duration}</span>
              </div>
              {sessionLog.testerName && (
                <div>
                  <span className="text-gray-500">Operator:</span>{" "}
                  <span className="font-semibold">{sessionLog.testerName}</span>
                </div>
              )}
              {sessionLog.bayId && (
                <div>
                  <span className="text-gray-500">Bay:</span>{" "}
                  <span className="font-mono font-semibold">{sessionLog.bayId}</span>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-gray-500">Total Readings:</span>{" "}
                <span className="font-mono font-semibold">
                  {(sessionLog.totalReadings || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2 — Executive Summary */}
          <div className="mb-6">
            <h3 className="mb-2 border-b-2 border-[#FFB800] pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
              Executive Summary
            </h3>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox
                value={leakLocationTotal}
                label="Leak Locations"
                accentClass={leakLocationTotal > 0 ? "text-red-600" : "text-emerald-600"}
              />
              <StatBox
                value={faultCount}
                label="Sensor Faults"
                accentClass={faultCount > 0 ? "text-amber-600" : "text-emerald-600"}
              />
              <StatBox value={dqpCount} label="DQP Events" accentClass="text-cyan-600" />
              <StatBox value={ssgCount} label="SSG Suppressions" accentClass="text-gray-600" />
            </div>
            {leakCount > 0 && (
              <p className="mb-3 text-[11px] text-gray-500">
                {leakCount} scenario detection{leakCount !== 1 ? "s" : ""} ·{" "}
                {leakLocationTotal} concurrent leak location{leakLocationTotal !== 1 ? "s" : ""}{" "}
                identified (multi-leak scenarios register 2 sites per detection).
              </p>
            )}
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold"
              style={{
                backgroundColor: `rgb(${status.bgColor.join(",")})`,
                color: `rgb(${status.textColor.join(",")})`,
              }}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{
                  backgroundColor: `rgb(${(status.color || status.textColor).join(",")})`,
                }}
                aria-hidden
              />
              <span>
                Overall Status: [{status.icon}] {status.text}
              </span>
            </div>
          </div>

          {/* Section 2b — Scenario timeline */}
          {(sessionLog.scenarioSegments || []).length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 border-b-2 border-cyan-600 pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
                Scenario Run Timeline
              </h3>
              <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                Each row is a demo scenario window.{" "}
                <strong className="font-semibold text-gray-700">Locations</strong> counts
                concurrent leak sites — multi-leak rows show{" "}
                <strong className="font-semibold text-purple-700">2</strong> when two failure
                modes are detected together.
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Scenario</th>
                      <th className="px-3 py-2">Readings</th>
                      <th className="px-3 py-2">Locations</th>
                      <th className="px-3 py-2">SFI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sessionLog.scenarioSegments || []).map((seg, idx) => {
                      const end = seg.endReading ?? sessionLog.totalReadings ?? seg.startReading;
                      const leakLocN = countLeakLocationsInSegment(
                        sessionLog.leakEvents,
                        seg,
                        sessionLog.totalReadings
                      );
                      const faultN = countEventsInSegment(
                        sessionLog.sensorFaults,
                        seg,
                        sessionLog.totalReadings
                      );
                      const isMulti = String(seg.label).includes("Multi:");
                      return (
                        <tr
                          key={`${seg.scenarioId}-${idx}`}
                          className="border-t border-gray-100 bg-white even:bg-gray-50/80"
                        >
                          <td className="px-3 py-2.5 font-mono text-gray-400">{idx + 1}</td>
                          <td className={`px-3 py-2.5 font-semibold ${isMulti ? "text-purple-800" : "text-gray-800"}`}>
                            {seg.label}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-600">
                            {seg.startReading}–{end}
                          </td>
                          <td className="px-3 py-2.5">
                            {leakLocN > 0 ? (
                              <span
                                className={`font-bold ${isMulti && leakLocN >= 2 ? "text-purple-700" : "text-red-600"}`}
                                title={
                                  isMulti && leakLocN >= 2
                                    ? "Dual concurrent leak locations detected"
                                    : "Single leak location detected"
                                }
                              >
                                {leakLocN}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {faultN > 0 ? (
                              <span className="font-bold text-amber-600">{faultN}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 2c — Scenario validation */}
          {validation.total > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 border-b-2 border-emerald-600 pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
                Scenario Validation
              </h3>
              <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                Compares injected demo scenario against ML outcome for this session.{" "}
                <strong className="font-semibold text-emerald-700">
                  {validation.pass}/{validation.total} passed
                </strong>
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Scenario injected</th>
                      <th className="px-3 py-2">Expected</th>
                      <th className="px-3 py-2">ML detected</th>
                      <th className="px-3 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.results.map((row, idx) => {
                      const statusClass =
                        row.status === "pass"
                          ? "text-emerald-700"
                          : row.status === "sfi_demo"
                            ? "text-amber-700"
                          : row.status === "miss"
                            ? "text-amber-700"
                            : "text-red-600";
                      return (
                        <tr
                          key={`${row.segment.scenarioId}-${idx}`}
                          className="border-t border-gray-100 bg-white even:bg-gray-50/80"
                        >
                          <td className="px-3 py-2.5 font-semibold text-gray-800">
                            {row.segment.label}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{row.expectedLabel}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-800">
                            {row.detectedLabel}
                          </td>
                          <td className={`px-3 py-2.5 font-bold ${statusClass}`}>
                            {row.statusLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 3 — Leak Events */}
          <div className="mb-6">
            <h3 className="mb-3 border-b-2 border-[#FFB800] pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
              Leak Events
            </h3>
            {(sessionLog.leakEvents || []).length === 0 ? (
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                ✓ No leak events detected during this session.
              </div>
            ) : (
              (sessionLog.leakEvents || []).map((event) => {
                const activeLeaks = event.activeLeakDetails?.length >= 2
                  ? event.activeLeakDetails
                  : [];
                const isMulti = event.isMultiLeak || activeLeaks.length >= 2;
                return (
                <div
                  key={event.eventId}
                  className="mb-4 overflow-hidden rounded-lg border border-gray-200"
                >
                  <div className={`flex items-center justify-between px-4 py-2 ${isMulti ? "bg-purple-950" : "bg-[#1B2D42]"}`}>
                    <span className="text-sm font-bold text-[#FFB800]">
                      {isMulti ? "MULTI-LEAK " : ""}EVENT {event.eventId}
                    </span>
                    <span className="font-mono text-xs text-white">{event.timestamp}</span>
                  </div>
                  <div className={`border-l-4 bg-gray-50 p-4 ${isMulti ? "border-purple-500" : "border-amber-500"}`}>
                    {event.scenarioLabel && (
                      <div className="mb-2 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[11px] text-cyan-900">
                        <span className="font-semibold uppercase tracking-wide text-cyan-700">
                          Demo scenario:{" "}
                        </span>
                        {event.scenarioLabel}
                        <span className="ml-2 text-cyan-600">
                          · first detection at reading #{event.readingNumber}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Location:</span>{" "}
                        <span className="font-bold">
                          {(event.leakLocation || "").replace(/_/g, " ")}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Confidence:</span>{" "}
                        <span className="font-bold">
                          {Number(event.confidence || 0).toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Severity:</span>{" "}
                        <span className="font-bold text-amber-600">{event.leakSeverity}</span>
                      </div>
                      {event.performanceImpactPct > 0 && (
                        <div>
                          <span className="text-gray-500">Performance Impact:</span>{" "}
                          <span className="font-bold text-red-600">
                            {Number(event.performanceImpactPct).toFixed(1)}%
                          </span>
                          {event.impactBasis && (
                            <span className="text-gray-500"> — {event.impactBasis}</span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Action:</span>{" "}
                        <span className="font-bold">
                          {(event.recommendedAction || "").replace(/_/g, " ")}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Reading #:</span>{" "}
                        <span className="font-mono">{event.readingNumber}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Engine:</span>{" "}
                        <span className="font-mono">
                          {event.engineRpm} RPM / {event.engineLoad}% load
                        </span>
                      </div>
                    </div>

                    {isMulti && activeLeaks.length >= 2 && (
                      <div className="mt-3 space-y-3">
                        {activeLeaks.slice(0, 2).map((leak, idx) => {
                          const rca = (event.multiRcaResults || [])[idx];
                          return (
                            <div
                              key={leak.location}
                              className={`rounded-lg border p-3 text-xs ${idx === 0 ? "border-orange-200 bg-orange-50" : "border-purple-200 bg-purple-50"}`}
                            >
                              <div className="mb-2 font-bold uppercase tracking-wide text-gray-600">
                                {idx === 0 ? "Primary" : "Secondary"} — {(leak.location || "").replace(/_/g, " ")}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-gray-500">Severity:</span>{" "}
                                  <span className="font-bold">{leak.severity}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Confidence:</span>{" "}
                                  <span className="font-bold">{Number(leak.confidence || 0).toFixed(1)}%</span>
                                </div>
                              </div>
                              {rca?.topCause && (
                                <p className="mt-2 text-gray-700">
                                  <span className="font-semibold">Top RCA:</span> {rca.topCause} ({rca.topCausePct})
                                </p>
                              )}
                              <RcaBlock rca={rca} compact />
                              {(leak.shapDrivers || []).length > 0 && (
                                <div className="mt-2">
                                  <div className="mb-1 font-bold text-gray-600">SHAP drivers</div>
                                  {leak.shapDrivers.slice(0, 3).map((d) => (
                                    <div key={d.sensor} className="flex justify-between text-[10px]">
                                      <span>{(d.sensor || "").replace(/_/g, " ")}</span>
                                      <span className="font-mono font-bold">
                                        {(d.deviation_pct ?? 0) > 0 ? "+" : ""}
                                        {Number(d.deviation_pct ?? 0).toFixed(1)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {event.scenarioLabel && (
                          <p className="text-[11px] text-purple-800">
                            Scenario: <span className="font-semibold">{event.scenarioLabel}</span>
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                      <div className="font-bold text-emerald-700">
                        {event.sfiConfirmed
                          ? `✓ LEAK PATTERN CONFIRMED — ${event.sfiPatternCheck || ""}`
                          : "⚠ Pattern unconfirmed"}
                      </div>
                      <p className="mt-1 text-gray-700">{event.sfiPhysicalBasis}</p>
                      {event.dqpSummary && (
                        <p className="mt-1 text-gray-500">
                          Data Quality: {event.dqpScore}/100 — {event.dqpSummary}
                        </p>
                      )}
                    </div>

                    {!isMulti && <RcaBlock rca={event.rcaResult} />}

                    {(event.shapDrivers || []).length > 0 && !isMulti && (
                      <div className="mt-3">
                        <div className="mb-2 text-xs font-bold uppercase text-[#0D1B2A]">
                          Top SHAP Sensors
                        </div>
                        {(event.shapDrivers || []).slice(0, 5).map((d) => {
                          const dev = d.deviation_pct ?? d.deviationPct ?? 0;
                          return (
                            <div key={d.sensor} className="mb-2 text-xs">
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-700">
                                  {(d.sensor || "").replace(/_/g, " ")}
                                </span>
                                <span
                                  className={`font-mono font-bold ${
                                    dev < 0 ? "text-red-600" : "text-emerald-600"
                                  }`}
                                >
                                  {dev > 0 ? "+" : ""}
                                  {Number(dev).toFixed(1)}%
                                </span>
                              </div>
                              {d.yourValue != null && (
                                <div className="text-[10px] text-gray-500">
                                  {d.yourValue} (baseline {d.baseline})
                                </div>
                              )}
                              <ShapBar deviationPct={dev} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
              })
            )}
          </div>

          {/* Section 4 — Sensor Faults */}
          {(sessionLog.sensorFaults || []).length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 border-b-2 border-amber-500 pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
                Sensor Fault Events
              </h3>
              {(sessionLog.sensorFaults || []).map((fault) => (
                <div
                  key={fault.eventId}
                  className="mb-3 overflow-hidden rounded-lg border border-amber-200 bg-amber-50"
                >
                  <div className="flex items-center justify-between bg-[#1B2D42] px-4 py-2">
                    <span className="text-sm font-bold text-amber-400">
                      FAULT {fault.eventId}
                    </span>
                    <span className="font-mono text-xs text-white">{fault.timestamp}</span>
                  </div>
                  <div className="border-l-4 border-amber-500 p-4 text-xs">
                    {fault.scenarioLabel && (
                      <div className="mb-2 rounded-md border border-amber-200 bg-amber-100/60 px-2.5 py-1.5 text-[11px] text-amber-950">
                        <span className="font-semibold uppercase tracking-wide text-amber-800">
                          Demo scenario:{" "}
                        </span>
                        {fault.scenarioLabel}
                        <span className="ml-2 text-amber-700">
                          · first SFI at reading #{fault.readingNumber}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Faulty Sensor:</span>{" "}
                      <span className="font-bold">
                        {(fault.faultedSensor || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="text-gray-500">Action:</span>{" "}
                      <span className="font-bold text-amber-700">
                        {(fault.actionTaken || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="text-gray-500">Reading #:</span>{" "}
                      <span className="font-mono">{fault.readingNumber}</span>
                    </div>
                    <p className="mt-2 text-gray-700">{fault.faultReason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section 4b — DQP / SSG detail */}
          {(dqpCount > 0 || ssgCount > 0) && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {dqpCount > 0 && (
                <div className="overflow-hidden rounded-lg border border-cyan-200">
                  <div className="bg-cyan-950 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                    Data Quality Events ({dqpCount})
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-white p-2">
                    <table className="w-full text-left text-[10px]">
                      <thead className="text-gray-400">
                        <tr>
                          <th className="px-2 py-1">Reading</th>
                          <th className="px-2 py-1">Time</th>
                          <th className="px-2 py-1">Score</th>
                          <th className="px-2 py-1">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sessionLog.dqpEvents || []).slice(0, 15).map((evt, i) => (
                          <tr key={`dqp-${evt.readingNumber}-${i}`} className="border-t border-gray-100">
                            <td className="px-2 py-1 font-mono">#{evt.readingNumber}</td>
                            <td className="px-2 py-1 font-mono">{evt.timestamp}</td>
                            <td className="px-2 py-1 font-mono">{evt.score ?? "—"}</td>
                            <td className="px-2 py-1">
                              {(evt.flags || []).map((f) => f.severity).join(", ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dqpCount > 15 && (
                      <p className="mt-2 text-center text-[10px] text-gray-400">
                        + {dqpCount - 15} more in session log
                      </p>
                    )}
                  </div>
                </div>
              )}
              {ssgCount > 0 && (
                <div className="overflow-hidden rounded-lg border border-gray-300">
                  <div className="bg-[#1B2D42] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-300">
                    SSG Suppressions ({ssgCount})
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-white p-2">
                    <table className="w-full text-left text-[10px]">
                      <thead className="text-gray-400">
                        <tr>
                          <th className="px-2 py-1">Reading</th>
                          <th className="px-2 py-1">Time</th>
                          <th className="px-2 py-1">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sessionLog.ssgEvents || []).slice(0, 15).map((evt, i) => (
                          <tr key={`ssg-${evt.readingNumber}-${i}`} className="border-t border-gray-100">
                            <td className="px-2 py-1 font-mono">#{evt.readingNumber}</td>
                            <td className="px-2 py-1 font-mono">{evt.timestamp}</td>
                            <td className="px-2 py-1">{evt.reason || "Transient state"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 5 — System Performance */}
          <div className="mb-6">
            <h3 className="mb-3 border-b-2 border-[#FFB800] pb-1 text-sm font-bold uppercase text-[#0D1B2A]">
              System Performance
            </h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Detection Engine:</span>{" "}
                  <span className="font-semibold">{activeModelDisplay}</span>
                  {modelAccuracyDisplay && (
                    <span className="text-gray-500"> ({modelAccuracyDisplay} loc. accuracy)</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Total Readings:</span>{" "}
                  <span className="font-mono font-semibold">
                    {(sessionLog.totalReadings || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Leak Locations:</span>{" "}
                  <span className="font-semibold">{leakLocationTotal}</span>
                </div>
                <div>
                  <span className="text-gray-500">Scenario Detections:</span>{" "}
                  <span className="font-semibold">{leakCount}</span>
                </div>
                <div>
                  <span className="text-gray-500">Validation:</span>{" "}
                  <span className="font-semibold text-emerald-700">
                    {validation.total > 0 ? `${validation.pass}/${validation.total} pass` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Sensor Faults:</span>{" "}
                  <span className="font-semibold">{faultCount}</span>
                </div>
                <div>
                  <span className="text-gray-500">DQP Events:</span>{" "}
                  <span className="font-semibold">{dqpCount}</span>
                </div>
                <div>
                  <span className="text-gray-500">SSG Suppressions:</span>{" "}
                  <span className="font-semibold">{ssgCount}</span>
                </div>
              </div>
              {(sessionLog.scenarioHistory || []).length > 0 && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <div className="text-xs font-bold text-gray-700">Scenarios Run:</div>
                  <ul className="mt-1 list-inside list-disc text-xs text-gray-600">
                    {(sessionLog.scenarioHistory || []).map((sc) => (
                      <li key={sc} className={String(sc).includes("Multi:") ? "font-semibold text-purple-700" : ""}>
                        {sc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {((sessionLog.scenarioHistory || []).some((sc) => String(sc).includes("Multi:"))
                || (sessionLog.leakEvents || []).some((e) => e.isMultiLeak)) && (
                <div className="mt-3 border-t border-purple-200 pt-3">
                  <div className="text-xs font-bold text-purple-900">Multi-Leak Scenario Reference</div>
                  <ul className="mt-2 space-y-1 text-[10px] text-gray-600">
                    {MULTI_LEAK_SCENARIOS.map((sc) => (
                      <li
                        key={sc.id}
                        className={
                          (sessionLog.scenarioHistory || []).includes(SCENARIO_LABELS[sc.id])
                            ? "font-semibold text-purple-800"
                            : ""
                        }
                      >
                        {SCENARIO_LABELS[sc.id]} — {sc.combo.replace(/\+/g, " + ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Section 6 — Footer */}
          <div className="rounded-lg bg-[#0D1B2A] px-4 py-4 text-center text-xs text-gray-400">
            <p>Generated by: Caterpillar Diesel Engine Leak Detection System v1.0</p>
            <p className="mt-1">
              Caterpillar Tech Challenge 2026 | Problem Statement 3
            </p>
            <p className="mt-1 font-semibold text-gray-500">CONFIDENTIAL — For internal use</p>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleShareCell}
              className="rounded-lg border border-cyan-600 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-900 hover:bg-cyan-100"
            >
              Share to Cell Ops
            </button>
            <button
              type="button"
              onClick={handleShareEmail}
              className="rounded-lg border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Email
            </button>
          </div>
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg bg-[#FFB800] px-4 py-2 text-sm font-bold text-[#0D1B2A] hover:bg-yellow-400"
          >
            Download PDF
          </button>
          </div>
        </div>
      </div>

      <ReportEmailDialog
        open={emailDialogOpen}
        sessionLog={sessionLog}
        senderName={senderName}
        onClose={() => setEmailDialogOpen(false)}
        onSent={() => {
          setShareStatus("Report emailed with PDF attached.");
          setEmailDialogOpen(false);
        }}
      />
    </div>
  );
}
