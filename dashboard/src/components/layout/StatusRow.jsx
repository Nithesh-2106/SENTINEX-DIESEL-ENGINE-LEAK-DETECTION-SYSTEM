import React from "react";

export default function StatusRow({ label, value, colour = "info" }) {
  return (
    <div className="status-row">
      <span className="status-row-label">{label}</span>
      <span className={`status-row-value ${colour}`} title={String(value)}>{value}</span>
    </div>
  );
}
