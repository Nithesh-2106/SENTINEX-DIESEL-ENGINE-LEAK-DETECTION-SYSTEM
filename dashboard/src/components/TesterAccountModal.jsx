import React, { useEffect } from "react";
import TesterAccountPanel from "./TesterAccountPanel.jsx";

export default function TesterAccountModal({ open, role, onClose, onRegistryChange }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !role) return null;

  return (
    <div className="tester-console-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="tester-console-modal tester-account-modal liquid-glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="tester-account-modal-title"
      >
        <div className="tester-console-modal__header">
          <div>
            <span className="tester-console-modal__eyebrow">Tester console</span>
            <h2 id="tester-account-modal-title" className="tester-console-modal__title">
              My bay account
            </h2>
            <p className="tester-console-modal__desc">
              Bay name is assigned by the test head. You can change your username and password here.
            </p>
          </div>
          <button type="button" className="tester-console-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <TesterAccountPanel
          role={role}
          embedded
          onRegistryChange={onRegistryChange}
          onSaved={onClose}
        />
      </div>
    </div>
  );
}
