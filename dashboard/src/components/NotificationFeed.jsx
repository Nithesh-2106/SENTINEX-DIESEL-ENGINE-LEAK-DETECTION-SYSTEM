import React from "react";
import { NOTIFICATION_STYLES, parseNotificationItem } from "../utils/opsNotifications.js";

export default function NotificationFeed({ items, embedded = false }) {
  const rows = (items || []).slice(0, 10).map(parseNotificationItem);

  return (
    <div className={`ops-notify-feed ${embedded ? "ops-notify-feed--embedded" : ""}`}>
      {!embedded && (
        <div className="ops-notify-feed-header">
          <h3 className="ops-notify-feed-title">Ops Notifications</h3>
          <p className="ops-notify-feed-sub">Readable cell events — no raw SMTP IDs</p>
        </div>
      )}

      <div className="ops-notify-list">
        {rows.length === 0 && (
          <div className="ops-notify-empty">No notifications yet.</div>
        )}
        {rows.map((n) => {
          const style = NOTIFICATION_STYLES[n.type] || NOTIFICATION_STYLES.info;
          return (
            <article key={n.id} className={`ops-notify-card ops-notify-card--${style.tone}`}>
              <div className="ops-notify-card-top">
                <span className="ops-notify-time">{n.displayTime}</span>
                <span className={`ops-notify-badge ops-notify-badge--${style.tone}`}>
                  {style.label}
                </span>
              </div>
              <h4 className="ops-notify-card-title">{n.title}</h4>
              <p className="ops-notify-card-summary">{n.summary}</p>
              {n.detail && <p className="ops-notify-card-detail">{n.detail}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
