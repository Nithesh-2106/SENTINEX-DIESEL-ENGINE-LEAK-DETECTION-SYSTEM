import React from "react";

/** Mini animated ARIA robot for main nav tab */
export default function AriaNavOrb({ active = false }) {
  return (
    <span className={`aria-nav-orb ${active ? "aria-nav-orb--active" : ""}`} aria-hidden>
      <span className="aria-nav-orb-glow" />
      <span className="aria-nav-orb-body">
        <span className="aria-nav-orb-antenna" />
        <span className="aria-nav-orb-face">
          <span className="aria-nav-orb-eye aria-nav-orb-eye--l" />
          <span className="aria-nav-orb-eye aria-nav-orb-eye--r" />
        </span>
        <span className="aria-nav-orb-core">A</span>
      </span>
    </span>
  );
}
