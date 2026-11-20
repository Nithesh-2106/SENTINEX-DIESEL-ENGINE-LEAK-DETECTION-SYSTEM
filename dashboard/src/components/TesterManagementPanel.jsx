import React, { useCallback, useEffect, useState } from "react";
import {
  createTester,
  deleteTester,
  fetchTesters,
  formatApiError,
  testerRowToRegistryEntry,
} from "../api/adminTesters.js";
import { REGISTRY_CHANGE_EVENT } from "../utils/testerRegistry.js";
import { logCellActivity } from "../utils/testerPresence.js";
import { loadAuthSession } from "../lib/authSession.js";

export default function TesterManagementPanel({ role, onRegistryChange, compact = false }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchTesters();
      const next = rows.filter((r) => r.is_active !== false).map(testerRowToRegistryEntry);
      setRegistry(next);
      onRegistryChange?.(next);
      window.dispatchEvent(new CustomEvent(REGISTRY_CHANGE_EVENT));
    } catch (err) {
      setError(formatApiError(err) || "Could not load testers.");
    }
  }, [onRegistryChange]);

  useEffect(() => {
    if (role === "head") refresh();
  }, [role, refresh]);

  if (role !== "head") return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const created = await createTester({
        displayName: name,
        username,
        password,
      });
      logCellActivity({
        role: "head",
        displayName: loadAuthSession()?.displayName || "Test Head",
        type: "TESTER_ADDED",
        message: `Added tester "${created.display_name}" (${created.username})`,
      });
      setName("");
      setUsername("");
      setPassword("");
      await refresh();
    } catch (err) {
      setError(formatApiError(err) || "Failed to add tester.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditName(t.displayName);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = () => {
    setError("Rename via Supabase dashboard for now — display name update coming soon.");
    cancelEdit();
  };

  const handleRemove = async (t, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setError("");
    if (confirmDeleteId !== t.userId) {
      setConfirmDeleteId(t.userId);
      return;
    }
    setLoading(true);
    try {
      await deleteTester(t.userId);
      logCellActivity({
        role: "head",
        displayName: loadAuthSession()?.displayName || "Test Head",
        type: "TESTER_REMOVED",
        message: `Removed tester "${t.displayName}" (${t.username})`,
      });
      if (editingId === t.id) cancelEdit();
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      setError(formatApiError(err) || "Failed to remove tester.");
      setConfirmDeleteId(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="tester-console-mgmt"
      className={`tester-mgmt-panel ${compact ? "tester-mgmt-panel--compact" : "section-card compact"}`}
    >
      {!compact && (
        <div className="section-card-header">
          <span className="section-card-title">TESTER CONSOLES</span>
        </div>
      )}
      <div className={compact ? "tester-mgmt-body" : "section-card-body"}>
        {!compact && (
          <p className="tester-mgmt-desc">
            Head creates tester logins (username + password). Each new tester gets the next bay (TC-B1, TC-B2, …).
          </p>
        )}

        <form className="tester-mgmt-form" onSubmit={handleAdd}>
          <input
            type="text"
            className="tester-mgmt-input"
            placeholder="Bay name (e.g. Bay 1 — Sam)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <input
            type="text"
            className="tester-mgmt-input tester-mgmt-input--short"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
          <input
            type="text"
            className="tester-mgmt-input tester-mgmt-input--short"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="tester-mgmt-add-btn" disabled={loading}>
            {loading ? "Adding…" : "Add bay"}
          </button>
        </form>
        {error && <p className="tester-mgmt-error">{error}</p>}

        <div className="tester-mgmt-list">
          {registry.length === 0 && (
            <p className="tester-mgmt-desc">No testers yet — add one above.</p>
          )}
          {registry.map((t) => (
            <div key={t.userId || t.id} className="tester-mgmt-row">
              {editingId === t.id ? (
                <div className="tester-mgmt-edit">
                  <input
                    type="text"
                    className="tester-mgmt-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Bay display name"
                  />
                  <div className="tester-mgmt-edit-hint">
                    Login: <code>{t.username}</code>
                  </div>
                  <div className="tester-mgmt-edit-actions">
                    <button type="button" className="tester-mgmt-save" onClick={() => saveEdit(t)}>
                      Save name
                    </button>
                    <button type="button" className="tester-mgmt-cancel" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="tester-mgmt-row-name">{t.displayName}</div>
                    <div className="tester-mgmt-row-cred">
                      <code>{t.username}</code>
                      {t.bayId && <span className="tester-mgmt-builtin-inline">{t.bayId}</span>}
                    </div>
                  </div>
                  <div className="tester-mgmt-actions">
                    <button type="button" className="tester-mgmt-modify" onClick={() => startEdit(t)}>
                      Modify
                    </button>
                    <button
                      type="button"
                      className={`tester-mgmt-remove ${confirmDeleteId === t.userId ? "is-confirm" : ""}`}
                      onClick={(e) => handleRemove(t, e)}
                      disabled={loading}
                      title={
                        confirmDeleteId === t.userId
                          ? "Click again to permanently delete this tester"
                          : "Delete tester login and bay"
                      }
                    >
                      {confirmDeleteId === t.userId ? "Confirm delete?" : "Delete"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
