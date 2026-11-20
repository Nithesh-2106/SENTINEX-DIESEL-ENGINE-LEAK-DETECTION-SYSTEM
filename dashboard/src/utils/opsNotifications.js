/** Parse legacy subject strings into readable notification cards. */
export function parseNotificationItem(n) {
  if (n.type && n.title) return n;

  const subject = n.subject || "";
  const ts = n.ts;
  const time = ts
    ? new Date(ts).toLocaleString("en-GB", {
        hour12: false,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  let type = "info";
  let title = "Cell update";
  let summary = subject;
  let detail = null;

  if (/REQUEST SUBMITTED/i.test(subject)) {
    type = "submitted";
    title = "Change request submitted";
    summary = subject.replace(/^REQUEST SUBMITTED\s*/i, "").replace(/— pending.*/i, "").trim();
    detail = "Awaiting Test Head approval";
  } else if (/PENDING APPROVAL/i.test(subject)) {
    type = "pending";
    title = "Pending approval";
    summary = subject.replace(/^PENDING APPROVAL:\s*/i, "").trim();
    detail = "Test Head inbox";
  } else if (/^APPROVED/i.test(subject)) {
    type = "approved";
    title = "Request approved";
    summary = subject.replace(/^APPROVED:\s*/i, "").trim();
    detail = "Setpoints applied to simulator";
  } else if (/^REJECTED/i.test(subject)) {
    type = "rejected";
    title = "Request rejected";
    const parts = subject.replace(/^REJECTED:\s*/i, "").split(" — ");
    summary = parts[0]?.trim() || subject;
    detail = parts[1]?.trim() || "See rejection cause in Change Requests";
  }

  return { ...n, type, title, summary, detail, displayTime: time };
}

export const NOTIFICATION_STYLES = {
  submitted: { label: "SUBMITTED", tone: "cyan" },
  pending: { label: "PENDING", tone: "amber" },
  approved: { label: "APPROVED", tone: "lime" },
  rejected: { label: "REJECTED", tone: "red" },
  info: { label: "OPS", tone: "slate" },
};
