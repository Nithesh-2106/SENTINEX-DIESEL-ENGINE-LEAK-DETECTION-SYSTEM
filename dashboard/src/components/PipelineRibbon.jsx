import React from "react";

const STAGES = [
  { id: "sim", label: "Simulator" },
  { id: "api", label: "FastAPI /predict" },
  { id: "guard", label: "Steady Guard" },
  { id: "ml", label: "ML Models" },
  { id: "shap", label: "SHAP" },
  { id: "ui", label: "HUD UI" },
];

function stageClass(active) {
  if (active) {
    return "bg-hud-cyan/15 text-hud-cyan ring-1 ring-hud-cyan/30";
  }
  return "bg-hud-border/30 text-hud-textMuted";
}

/**
 * @param {{
 *   activeStageId: string;
 * }} props
 */
export default function PipelineRibbon({ activeStageId }) {
  return (
    <div className="border-b border-hud-border bg-hud-bg1/70 px-6 py-2">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-2">
        <span className="mr-2 text-[11px] font-extrabold uppercase tracking-wider text-hud-textMuted">
          Pipeline
        </span>
        {STAGES.map((s, idx) => (
          <React.Fragment key={s.id}>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${stageClass(
                s.id === activeStageId
              )}`}
            >
              {s.label}
            </span>
            {idx < STAGES.length - 1 && (
              <span className="text-hud-textMuted/50">→</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

