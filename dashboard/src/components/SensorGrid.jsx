/**
 * SensorGrid.jsx — All 42 live-stream sensor channels in bordered path + component zones.
 */
import React, { useMemo } from "react";
import {
  SENSOR_DEFINITIONS,
  COMPONENT_META,
  ALL_SENSOR_KEYS,
} from "../constants/sensorDefinitions.js";
import { ENGINE_HAS_SCR } from "../simulator.js";

const PATH_GROUPS = [
  {
    key: "intake",
    label: "INTAKE PATH",
    tone: "intake",
    components: ["AIR_FILTER", "TURBOCHARGER", "CAC"],
  },
  {
    key: "engine",
    label: "ENGINE / EGR",
    tone: "engine",
    components: ["ENGINE_BLOCK", "EGR_COOLER"],
  },
  {
    key: "exhaust",
    label: "EXHAUST PATH",
    tone: "exhaust",
    components: ["DPF_DOC", "SCR", "EXHAUST_OUT"],
  },
];

function trendArrow(historyVals) {
  if (historyVals.length < 2) return { sym: "–" };
  const d = historyVals[historyVals.length - 1] - historyVals[historyVals.length - 2];
  if (Math.abs(d) < 1e-5) return { sym: "–" };
  return d > 0 ? { sym: "↑" } : { sym: "↓" };
}

function devConfig(pct) {
  if (pct <= 2) return { barW: Math.min(pct * 5, 10) };
  if (pct <= 8) return { barW: Math.min(pct * 4, 50) };
  return { barW: Math.min(pct * 2.5, 100) };
}

function SensorCard({ c, tone }) {
  const dc = devConfig(c.pct);
  const devClass = c.pct > 15 ? "deviation-high" : c.pct > 8 ? "deviation-med" : "";
  const trendClass = c.trend.sym === "↑" ? "up" : c.trend.sym === "↓" ? "down" : "stable";
  const decimals = c.unit === "—" || c.unit === "" ? 2 : 1;

  return (
    <div
      title={`${c.key}\nBaseline: ${c.baseline.toFixed(3)}\nDeviation: ${c.pct.toFixed(2)}%`}
      className={`sensor-card sensor-card-zone sensor-card-zone--${tone} ${devClass}`}
    >
      <div className="sensor-card-name">{c.short}</div>
      {c.wasCleaned && <span className="sensor-card-trend" title="Cleaned by DQP">⚡</span>}
      {!c.wasCleaned && <span className={`sensor-card-trend ${trendClass}`}>{c.trend.sym}</span>}
      <div className={`sensor-card-value ${c.naScr ? "" : "updated"}`}>
        {c.naScr ? "—" : c.cur.toFixed(decimals)}
      </div>
      <div className="sensor-card-unit">{c.unit || "—"}</div>
      {!c.naScr && (
        <div className="sensor-card-bar">
          <div className="sensor-card-bar-fill" style={{ width: `${Math.max(2, dc.barW)}%` }} />
        </div>
      )}
    </div>
  );
}

function buildPathSections(activeEngine) {
  const hasScr = ENGINE_HAS_SCR[activeEngine] !== false;

  return PATH_GROUPS.map((group) => {
    const componentBlocks = group.components
      .filter((comp) => comp !== "SCR" || hasScr)
      .map((compKey) => {
        const meta = COMPONENT_META[compKey];
        const keys = ALL_SENSOR_KEYS.filter((k) => SENSOR_DEFINITIONS[k]?.component === compKey);
        if (keys.length === 0) return null;
        return {
          key: compKey,
          label: meta?.displayName?.toUpperCase() || compKey,
          keys,
        };
      })
      .filter(Boolean);

    const channelCount = componentBlocks.reduce((n, b) => n + b.keys.length, 0);
    return { ...group, componentBlocks, channelCount };
  }).filter((g) => g.channelCount > 0);
}

export default function SensorGrid({
  latestReading,
  historyStack,
  dynamicBaseline,
  dataQuality,
  engineBaselines,
  activeEngine = "CAT_C13",
}) {
  const cleanedSensors = useMemo(() => {
    const s = new Set();
    (dataQuality?.flags ?? []).forEach((f) => s.add(f.sensor));
    return s;
  }, [dataQuality]);

  const pathSections = useMemo(() => buildPathSections(activeEngine), [activeEngine]);

  const makeCard = (key) => {
    const def = SENSOR_DEFINITIONS[key];
    const naScr =
      !ENGINE_HAS_SCR[activeEngine] &&
      (key === "Post_SCR_Pressure_kPa" || key === "Post_SCR_Temp_C");
    const staticBase = engineBaselines?.[key] ?? def?.baseline ?? 0;
    const baseline =
      dynamicBaseline?.[key] != null ? Number(dynamicBaseline[key]) : staticBase;
    const cur = latestReading?.[key] ?? baseline;
    const hist = historyStack.map((h) => h[key]).filter((v) => v != null);
    const pct = naScr ? 0 : baseline !== 0 ? Math.abs(((cur - baseline) / Math.abs(baseline)) * 100) : 0;
    const trend = trendArrow(hist.length >= 2 ? hist.slice(-3) : [cur, cur]);
    return {
      key,
      short: def?.shortLabel ?? key,
      unit: def?.unit ?? "",
      cur,
      baseline,
      pct,
      trend,
      wasCleaned: cleanedSensors.has(key),
      naScr,
    };
  };

  const totalChannels = pathSections.reduce((n, s) => n + s.channelCount, 0);

  return (
    <section className="section-card telemetry-section">
      <div className="section-card-header">
        <span className="section-card-title">LIVE SENSOR TELEMETRY</span>
        <span className="telemetry-channel-count">{totalChannels} channels</span>
      </div>
      <div className="section-card-body telemetry-all-body">
        <div className="telemetry-paths-layout">
          {pathSections.map((path) => (
            <div key={path.key} className={`telemetry-path-zone telemetry-path-zone--${path.tone}`}>
              <div className={`telemetry-path-zone-header telemetry-path-zone-header--${path.tone}`}>
                <span className="telemetry-path-zone-title">{path.label}</span>
                <span className="telemetry-path-zone-count">{path.channelCount}</span>
              </div>
              <div className={`telemetry-components-layout telemetry-components-layout--${path.key}`}>
                {path.componentBlocks.map((block) => (
                  <div
                    key={block.key}
                    className={`telemetry-comp-box telemetry-comp-box--${path.tone}`}
                    style={{ "--sensor-count": block.keys.length }}
                  >
                    <div className="telemetry-comp-box-header">
                      <span className="telemetry-comp-box-title">{block.label}</span>
                      <span className="telemetry-comp-box-count">{block.keys.length}</span>
                    </div>
                    <div className="telemetry-comp-sensors">
                      {block.keys.map((key) => (
                        <SensorCard key={key} c={makeCard(key)} tone={path.tone} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
