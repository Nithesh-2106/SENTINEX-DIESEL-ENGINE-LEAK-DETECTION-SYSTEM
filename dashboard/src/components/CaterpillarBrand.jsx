import React from "react";

const LOGO_SRC = "/brand/caterpillar-logo.svg";

/**
 * Official Caterpillar company logo on a light plate for dark-theme contrast.
 */
export default function CaterpillarBrand({ variant = "header", className = "" }) {
  return (
    <span
      className={`cat-brand cat-brand--${variant} ${className}`.trim()}
      aria-label="Caterpillar"
    >
      <span className="cat-brand__plate">
        <img
          className="cat-brand__logo"
          src={LOGO_SRC}
          alt="Caterpillar"
          draggable={false}
        />
      </span>
    </span>
  );
}
