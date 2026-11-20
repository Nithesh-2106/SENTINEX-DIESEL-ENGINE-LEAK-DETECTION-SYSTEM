import React, { useCallback, useEffect, useMemo, useState } from "react";
import { displayNameForMessage, getMessagesForThread, listThreadsForRole, sendThreadMessage, unreadCountForThread } from "../utils/cellChat.js";
import { getTesterDisplayName, isHeadRole } from "../utils/testerRegistry.js";
import { shareFileToThread } from "../utils/chatAttachments.js";
import { shareReportToThread } from "../utils/sessionReportShare.js";
import { uploadSessionReport } from "../lib/supabaseReports.js";
import CellMessagingPanel from "./CellMessagingPanel.jsx";
import OpsChatLogo from "./OpsChatLogo.jsx";

function threadPreview(threadId, role) {
  const msgs = getMessagesForThread(threadId);
  const last = msgs[msgs.length - 1];
  if (!last) return "No messages yet";
  const prefix = last.from === role ? "You: " : "";
  return `${prefix}${last.text}`.slice(0, 48);
}

export default function CellCommsPage({
  role,
  testerRegistry = [],
  messagesReadAt,
  onMarkThreadRead,
  onSend,
  unreadCount,
  initialThreadId = null,
  onInitialThreadConsumed,
  pendingReportShare = null,
  onPendingReportShared,
  onCancelPendingReportShare,
  onOpenSharedReport,
}) {
  const threads = useMemo(() => listThreadsForRole(role, testerRegistry), [role, testerRegistry]);
  const [activeThreadId, setActiveThreadId] = useState(() => threads[0]?.id || null);
  const [shareTargetIds, setShareTargetIds] = useState(() => new Set());
  const [chatTick, setChatTick] = useState(0);

  const shareMode = Boolean(pendingReportShare);

  useEffect(() => {
    if (!shareMode) {
      setShareTargetIds(new Set());
      return;
    }
    setShareTargetIds((prev) => {
      if (prev.size > 0) return prev;
      return activeThreadId ? new Set([activeThreadId]) : new Set();
    });
  }, [shareMode]);

  useEffect(() => {
    if (!threads.find((t) => t.id === activeThreadId)) {
      setActiveThreadId(threads[0]?.id || null);
    }
  }, [threads, activeThreadId]);

  useEffect(() => {
    if (!initialThreadId) return;
    if (threads.some((t) => t.id === initialThreadId)) {
      setActiveThreadId(initialThreadId);
      onInitialThreadConsumed?.();
    }
  }, [initialThreadId, threads, onInitialThreadConsumed]);

  useEffect(() => {
    const bump = () => setChatTick((n) => n + 1);
    window.addEventListener("cat-cell-message", bump);
    window.addEventListener("cat-cell-messages-updated", bump);
    const poll = window.setInterval(bump, 1200);
    return () => {
      window.removeEventListener("cat-cell-message", bump);
      window.removeEventListener("cat-cell-messages-updated", bump);
      clearInterval(poll);
    };
  }, []);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = useMemo(
    () => (activeThreadId ? getMessagesForThread(activeThreadId) : []),
    [activeThreadId, chatTick],
  );

  useEffect(() => {
    if (activeThreadId) onMarkThreadRead?.(activeThreadId);
  }, [activeThreadId, messages.length, onMarkThreadRead]);

  const handleSend = useCallback(async (text) => {
    if (!activeThreadId || !text?.trim()) return;
    await sendThreadMessage({ from: role, threadId: activeThreadId, text, registry: testerRegistry });
    onSend?.(activeThreadId, text);
    setChatTick((n) => n + 1);
  }, [activeThreadId, role, testerRegistry, onSend]);

  const handleAttachFile = useCallback(async (file) => {
    if (!activeThreadId || !file) return;
    await shareFileToThread({
      from: role,
      threadId: activeThreadId,
      file,
      registry: testerRegistry,
    });
    setChatTick((n) => n + 1);
  }, [activeThreadId, role, testerRegistry]);

  const handleSharePendingReport = useCallback(async () => {
    if (!pendingReportShare || shareTargetIds.size === 0) return;
    const senderName = getTesterDisplayName(role);
    let reportStoragePath = null;
    try {
      const uploaded = await uploadSessionReport(pendingReportShare);
      reportStoragePath = uploaded?.path || null;
    } catch {
      reportStoragePath = null;
    }
    for (const threadId of shareTargetIds) {
      await shareReportToThread({
        from: role,
        threadId,
        sessionLog: pendingReportShare,
        senderName,
        reportStoragePath,
        registry: testerRegistry,
      });
    }
    setChatTick((n) => n + 1);
    onPendingReportShared?.();
  }, [pendingReportShare, shareTargetIds, role, testerRegistry, onPendingReportShared]);

  const toggleShareTarget = useCallback((threadId) => {
    setShareTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const selectAllShareTargets = useCallback(() => {
    setShareTargetIds(new Set(threads.map((t) => t.id)));
  }, [threads]);

  const clearShareTargets = useCallback(() => {
    setShareTargetIds(new Set());
  }, []);

  const selectedShareLabels = useMemo(
    () => threads.filter((t) => shareTargetIds.has(t.id)).map((t) => t.label),
    [threads, shareTargetIds],
  );

  return (
    <div className="comms-page comms-page--whatsapp">
      <div className="comms-hero-strip liquid-glass-panel">
        <OpsChatLogo size={32} className="comms-hero-strip__logo" />
        <div className="comms-hero-strip__copy">
          <span className="comms-hero-strip__title">Ops Chat</span>
          <span className="comms-hero-strip__sep" aria-hidden>·</span>
          <span className="comms-hero-strip__sub">
            TC-03 · {isHeadRole(role) ? "Direct & group threads" : "Head, peers, or cell group"}
          </span>
        </div>
        {unreadCount > 0 && (
          <span className="comms-hero-unread">{unreadCount} unread</span>
        )}
      </div>

      {shareMode && (
        <div className="comms-pending-share-bar" role="status">
          <span className="comms-pending-share-bar__icon" aria-hidden>PDF</span>
          <div className="comms-pending-share-bar__copy">
            <strong>Session report ready</strong>
            <span>
              Check one or more chats on the left, then share.
              {selectedShareLabels.length > 0 && (
                <> Selected: <em>{selectedShareLabels.join(", ")}</em></>
              )}
            </span>
          </div>
          <div className="comms-pending-share-bar__actions">
            <button
              type="button"
              className="comms-pending-share-bar__btn comms-pending-share-bar__btn--primary"
              onClick={handleSharePendingReport}
              disabled={shareTargetIds.size === 0}
            >
              Share to {shareTargetIds.size || 0} chat{shareTargetIds.size === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              className="comms-pending-share-bar__btn"
              onClick={onCancelPendingReportShare}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="wa-comms-layout liquid-glass-card">
        <aside className={`wa-comms-sidebar ${shareMode ? "wa-comms-sidebar--share-mode" : ""}`} aria-label="Conversations">
          <div className="wa-comms-sidebar__head">
            <span className="wa-comms-sidebar__title">{shareMode ? "Select chats" : "Chats"}</span>
            <span className="wa-comms-sidebar__you">{getTesterDisplayName(role)}</span>
          </div>
          {shareMode && (
            <div className="wa-comms-share-toolbar">
              <button type="button" className="wa-comms-share-toolbar__btn" onClick={selectAllShareTargets}>
                Select all
              </button>
              <button type="button" className="wa-comms-share-toolbar__btn" onClick={clearShareTargets}>
                Clear
              </button>
              <span className="wa-comms-share-toolbar__count">{shareTargetIds.size} selected</span>
            </div>
          )}
          <div className="wa-comms-thread-list">
            {threads.map((t) => {
              const unread = unreadCountForThread(role, t.id, messagesReadAt);
              const active = t.id === activeThreadId;
              const checked = shareTargetIds.has(t.id);

              if (shareMode) {
                return (
                  <div
                    key={t.id}
                    className={`wa-comms-thread-row ${active ? "active" : ""} ${checked ? "wa-comms-thread-row--checked" : ""}`}
                  >
                    <label className="wa-comms-thread-check" title={`Share to ${t.label}`}>
                      <input
                        type="checkbox"
                        className="wa-comms-thread-check__input"
                        checked={checked}
                        onChange={() => toggleShareTarget(t.id)}
                      />
                      <span className="wa-comms-thread-check__box" aria-hidden />
                    </label>
                    <button
                      type="button"
                      className={`wa-comms-thread-item ${t.type === "group" ? "wa-comms-thread-item--group" : ""}`}
                      onClick={() => setActiveThreadId(t.id)}
                    >
                      <span className={`wa-comms-thread-avatar ${t.type === "group" ? "wa-comms-thread-avatar--group" : ""}`}>
                        {t.type === "group" ? "#" : t.label.charAt(0)}
                      </span>
                      <span className="wa-comms-thread-copy">
                        <span className="wa-comms-thread-name">{t.label}</span>
                        <span className="wa-comms-thread-preview">{threadPreview(t.id, role)}</span>
                      </span>
                      {unread > 0 && <span className="wa-comms-thread-badge">{unread}</span>}
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={t.id}
                  type="button"
                  className={`wa-comms-thread-item ${active ? "active" : ""} ${t.type === "group" ? "wa-comms-thread-item--group" : ""}`}
                  onClick={() => setActiveThreadId(t.id)}
                >
                  <span className={`wa-comms-thread-avatar ${t.type === "group" ? "wa-comms-thread-avatar--group" : ""}`}>
                    {t.type === "group" ? "#" : t.label.charAt(0)}
                  </span>
                  <span className="wa-comms-thread-copy">
                    <span className="wa-comms-thread-name">{t.label}</span>
                    <span className="wa-comms-thread-preview">{threadPreview(t.id, role)}</span>
                  </span>
                  {unread > 0 && <span className="wa-comms-thread-badge">{unread}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="wa-comms-main">
          {activeThread ? (
            <CellMessagingPanel
              role={role}
              threadId={activeThreadId}
              threadLabel={activeThread.label}
              isGroup={activeThread.type === "group"}
              messages={messages}
              onSend={handleSend}
              onAttachFile={handleAttachFile}
              onOpenReport={onOpenSharedReport}
              fullPage
              hideHeader
              whatsappStyle
              displayNameFor={(from) => displayNameForMessage(from, testerRegistry)}
            />
          ) : (
            <div className="wa-comms-empty-main">
              <p>Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
