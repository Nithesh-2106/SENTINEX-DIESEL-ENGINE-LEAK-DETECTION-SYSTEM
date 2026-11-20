import React, { useEffect } from "react";
import ProductBrandLockup from "./ProductBrandLockup.jsx";
import TesterManagementPanel from "./TesterManagementPanel.jsx";

export default function TesterConsoleManagerModal({ open, onClose, onRegistryChange }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="tester-console-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="tester-console-modal liquid-glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="tester-console-modal-title"
      >
        <div className="tester-console-modal__header">
          <div>
            <div className="tester-console-modal__brand">
              <ProductBrandLockup variant="compact" />
            </div>
            <span className="tester-console-modal__eyebrow">Head console</span>
            <h2 id="tester-console-modal-title" className="tester-console-modal__title">
              Manage tester bays
            </h2>
            <p className="tester-console-modal__desc">
              Add, rename, or delete parallel tester consoles. Built-in bays can be renamed; custom bays can also be removed.
            </p>
          </div>
          <button type="button" className="tester-console-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <TesterManagementPanel role="head" compact onRegistryChange={onRegistryChange} />
      </div>
    </div>
  );
}
