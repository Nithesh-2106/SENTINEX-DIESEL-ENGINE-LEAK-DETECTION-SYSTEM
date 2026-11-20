import React, { useState } from "react";

export const DEFAULT_REJECT_REASONS = [
  "Setpoint exceeds safe envelope for current leak scenario",
  "Insufficient justification — specify physical test objective",
  "Engine not steady — wait for SSG clearance before disturbance",
  "Conflicts with active leak investigation protocol",
  "Ramp rate too aggressive for cell safety limits",
];

export default function RejectRequestModal({ request, onConfirm, onCancel }) {
  const [preset, setPreset] = useState(DEFAULT_REJECT_REASONS[0]);
  const [custom, setCustom] = useState("");
  const useCustom = preset === "__custom__";

  if (!request) return null;

  const target = `${Number(request.to.rpm).toFixed(0)} RPM / ${Number(request.to.load).toFixed(0)}%`;

  return (
    <div className="reject-modal-backdrop" role="dialog" aria-modal="true">
      <div className="reject-modal">
        <div className="reject-modal-header">
          <h3>Reject change request</h3>
          <p>
            Target <span className="font-mono text-sky-300">{target}</span> will not be applied.
          </p>
        </div>

        <label className="reject-modal-label">Rejection cause (delivered to Tester)</label>
        <select
          className="reject-modal-select"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {DEFAULT_REJECT_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          <option value="__custom__">Custom message…</option>
        </select>

        {useCustom && (
          <textarea
            className="reject-modal-textarea"
            rows={3}
            placeholder="Type rejection reason for the tester…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={280}
          />
        )}

        <div className="reject-modal-actions">
          <button type="button" className="reject-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="reject-modal-confirm"
            disabled={useCustom && !custom.trim()}
            onClick={() => onConfirm(useCustom ? custom.trim() : preset)}
          >
            Reject &amp; notify Tester
          </button>
        </div>
      </div>
    </div>
  );
}
