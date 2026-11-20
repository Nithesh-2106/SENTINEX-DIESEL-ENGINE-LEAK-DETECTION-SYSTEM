import React, { useMemo } from "react";

const STAGES = [
  { id: "pipeline", label: "PIPELINE" },
  { id: "sim", label: "SIMULATOR" },
  { id: "api", label: "FASTAPI /PREDICT" },
  { id: "guard", label: "STEADY GUARD" },
  { id: "ml", label: "ML MODELS" },
  { id: "shap", label: "SHAP" },
  { id: "ui", label: "HUD UI" },
];

export default function PipelineBreadcrumb({ activeStageId = "ui", isStreaming = false }) {
  const activeIndex = useMemo(
    () => Math.max(0, STAGES.findIndex((s) => s.id === activeStageId)),
    [activeStageId],
  );

  return (
    <div
      className={`pipeline-bar ${isStreaming ? "pipeline-bar--live" : ""}`}
      role="navigation"
      aria-label="Data pipeline"
    >
      <div className="pipeline-bar__ambient" aria-hidden>
        <div className="pipeline-bar__flow-sweep" />
        <div className="pipeline-bar__flow-beam" />
        <div className="pipeline-bar__scanline" />
      </div>

      <div className="pipeline-bar__steps">
        {STAGES.map((step, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <React.Fragment key={step.id}>
              <span className={`pipe-step pipe-step--${state}`} data-stage={step.id}>
                <span className="pipe-step__ring" aria-hidden />
                <span className="pipe-step__dot" aria-hidden />
                <span className="pipe-step__label">{step.label}</span>
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={`pipe-connector pipe-connector--${
                    i < activeIndex ? "done" : i === activeIndex ? "active" : "pending"
                  }`}
                  aria-hidden
                >
                  <span className="pipe-connector__track">
                    <span className="pipe-connector__fill" />
                    <span className="pipe-connector__packet" />
                  </span>
                  <span className="pipe-connector__chevron">›</span>
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
