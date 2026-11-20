import React from "react";
import CaterpillarBrand from "./CaterpillarBrand.jsx";
import SentinexLiveLogo from "./SentinexLiveLogo.jsx";

/**
 * Co-branded Caterpillar × SENTINEX lockup — single horizontal row.
 *
 * @param {"header"|"login"|"compact"|"portal"|"footer"|"report"} variant
 */
export default function ProductBrandLockup({
  variant = "header",
  className = "",
  showSentinex = true,
  showSubtitle = false,
}) {
  const catVariant =
    variant === "login"
      ? "login"
      : variant === "compact" || variant === "portal" || variant === "footer" || variant === "report"
        ? "compact"
        : "header";

  const sentinexSize =
    variant === "login" ? 58 : variant === "portal" ? 20 : variant === "compact" || variant === "footer" ? 22 : 34;

  const shimmerClass =
    variant === "login"
      ? "sentinex-shimmer-title sentinex-shimmer-title--login"
      : variant === "header"
        ? "sentinex-shimmer-title sentinex-shimmer-title--header"
        : "";

  return (
    <div className={`product-brand-lockup product-brand-lockup--${variant} ${className}`.trim()}>
      <CaterpillarBrand variant={catVariant} />
      {showSentinex && (
        <>
          <div className="product-brand-lockup__divider" aria-hidden />
          <div className="product-brand-lockup__sentinex">
            {variant !== "footer" && variant !== "report" && (
              <div
                className={`product-brand-lockup__mark ${
                  variant === "login" || variant === "header" ? "product-brand-lockup__mark--glow" : ""
                }`}
                aria-hidden
              >
                <SentinexLiveLogo size={sentinexSize} />
              </div>
            )}
            <div className="product-brand-lockup__text">
              <span className={`product-brand-lockup__name ${shimmerClass}`.trim()}>SENTINEX</span>
              {showSubtitle && variant === "header" && (
                <span className="product-brand-lockup__sub">
                  AI-POWERED LEAK DETECTION — REAL-TIME MONITOR
                </span>
              )}
              {variant === "footer" && (
                <span className="product-brand-lockup__sub">Leak detection platform</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
