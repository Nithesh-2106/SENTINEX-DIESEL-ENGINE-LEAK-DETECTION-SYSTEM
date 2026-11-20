import React, { useEffect, useState } from "react";
import {
  getTesterAccount,
  getTesterDisplayName,
  loadTesterRegistry,
  REGISTRY_CHANGE_EVENT,
  updateTesterCredentialsByTester,
} from "../utils/testerRegistry.js";
import { logCellActivity } from "../utils/testerPresence.js";

export default function TesterAccountPanel({
  role,
  onRegistryChange,
  embedded = false,
  dashboard = false,
  onSaved,
}) {
  const [registry, setRegistry] = useState(() => loadTesterRegistry());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const account = getTesterAccount(role, registry);
  const displayName = getTesterDisplayName(role, registry);

  useEffect(() => {
    const onChange = () => setRegistry(loadTesterRegistry());
    window.addEventListener(REGISTRY_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(REGISTRY_CHANGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!account) return;
    setUsername(account.username);
    setPassword(account.password || "");
    setCurrentPassword("");
    setError("");
    setSaved(false);
  }, [account?.id, account?.username, account?.password]);

  if (!role || role === "head") return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!account) {
      setError("Bay account not found. Ask the test head to verify your console is registered.");
      return;
    }
    const res = updateTesterCredentialsByTester(role, {
      username,
      password,
      currentPassword,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    logCellActivity({
      role,
      displayName,
      type: "TESTER_CREDENTIALS_UPDATED",
      message: `Updated login credentials for "${displayName}"`,
    });
    setCurrentPassword("");
    setSaved(true);
    const next = loadTesterRegistry();
    setRegistry(next);
    onRegistryChange?.(next);
    onSaved?.();
  };

  const body = (
    <>
      {!embedded && !dashboard && (
        <p className="tester-mgmt-desc">
          Your bay name is assigned by the test head. You can change your username and password here.
        </p>
      )}

      {!dashboard && (
        <div className="tester-account-name-row">
          <span className="tester-account-label">Bay name</span>
          <span className="tester-account-readonly">{displayName}</span>
        </div>
      )}

      <form className={`tester-account-form ${dashboard ? "tester-account-form--dashboard" : ""}`} onSubmit={handleSubmit}>
        <label className="tester-account-field">
          <span className="tester-account-label">Username</span>
          <input
            type="text"
            className="tester-mgmt-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={!account}
          />
        </label>
        <label className="tester-account-field">
          <span className="tester-account-label">New password</span>
          <input
            type="password"
            className="tester-mgmt-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!account}
          />
        </label>
        <label className="tester-account-field">
          <span className="tester-account-label">Current password</span>
          <input
            type="password"
            className="tester-mgmt-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Required to save changes"
            autoComplete="current-password"
            disabled={!account}
          />
        </label>
        <button
          type="submit"
          className="tester-mgmt-add-btn tester-account-save"
          disabled={!account}
        >
          Save credentials
        </button>
      </form>

      {error && <p className="tester-mgmt-error">{error}</p>}
      {saved && !error && (
        <p className="tester-account-saved">Credentials updated. Use them on your next login.</p>
      )}
    </>
  );

  if (embedded || dashboard) {
    return <div className={`tester-account-embedded ${dashboard ? "tester-account-embedded--dashboard" : ""}`}>{body}</div>;
  }

  return (
    <div id="tester-account-panel" className="tester-mgmt-panel section-card compact tester-account-panel">
      <div className="section-card-header">
        <span className="section-card-title">MY BAY ACCOUNT</span>
      </div>
      <div className="section-card-body">{body}</div>
    </div>
  );
}
