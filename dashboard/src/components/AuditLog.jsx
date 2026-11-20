import React from "react";

function fmt(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return "—";
  }
}

/**
 * @param {{
 *  events: any[];
 * }} props
 */
export default function AuditLog({ events, compact = false }) {
  const rows = (events || []).slice(0, 12);

  const list = (
    <div className={compact ? "audit-log-list audit-log-list--compact" : "mt-4 space-y-2"}>
      {rows.length === 0 && (
        <div className={compact ? "audit-log-empty" : "rounded-lg border border-hud-border bg-hud-card/50 p-4 text-sm text-hud-textMuted"}>
          No events yet.
        </div>
      )}
      {rows.map((e) => (
        <div key={e.id} className={compact ? "audit-log-row" : "rounded-lg border border-hud-border bg-hud-card/50 px-3 py-2 text-xs"}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-hud-textMuted">{fmt(e.ts)}</span>
            <span className="font-extrabold uppercase tracking-wider text-white/90">{e.type}</span>
          </div>
          <div className="mt-1 text-hud-textMuted">
            {e.message}
          </div>
        </div>
      ))}
    </div>
  );

  if (compact) return list;

  return (
    <div className="rounded-xl border border-hud-border bg-hud-bg1/60 p-5 hud-glow">
      <div className="text-[14px] font-extrabold uppercase tracking-wider text-hud-pink">
        Audit Log
      </div>
      <div className="mt-1 text-xs text-hud-textMuted">
        Immutable demo trail (request → approve/reject → apply).
      </div>
      {list}
    </div>
  );
}

