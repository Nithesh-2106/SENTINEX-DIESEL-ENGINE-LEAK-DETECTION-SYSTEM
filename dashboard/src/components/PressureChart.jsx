import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useChartTheme from "../hooks/useChartTheme.js";

/** Visual stack order — top line on chart to bottom (matches Y-axis at nominal pressures). */
function pressureSeries(chart) {
  return [
    { dataKey: "preTurbo", name: "Pre turbine", stroke: chart.line4 },
    { dataKey: "postComp", name: "Post compressor", stroke: chart.line2 },
    { dataKey: "postTurbo", name: "Post turbine", stroke: chart.line3 },
    { dataKey: "preComp", name: "Pre compressor", stroke: chart.line1 },
  ];
}

function PressureTooltip({ active, payload, label, chart }) {
  if (!active || !payload?.length) return null;

  const series = pressureSeries(chart);
  const ordered = series
    .map((s) => payload.find((p) => p.dataKey === s.dataKey))
    .filter(Boolean);

  return (
    <div
      style={{
        backgroundColor: chart.tooltipBg,
        border: `1px solid ${chart.tooltipBorder}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: chart.tooltipText,
      }}
    >
      <div style={{ color: chart.tooltipLabel, marginBottom: 6, fontSize: 11 }}>
        {`Reading #${Math.floor(Number(label))}`}
      </div>
      {ordered.map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 3,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: entry.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: chart.tooltipText }}>{entry.name}</span>
          </span>
          <span className="mono" style={{ color: entry.color, fontWeight: 700 }}>
            {`${Number(entry.value).toFixed(1)} kPa`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{
 *   data: Array<{
 *     readingNo: number;
 *     preComp: number;
 *     postComp: number;
 *     preTurbo: number;
 *     postTurbo: number;
 *   }>;
 *   leakAtReadingNo: number | null;
 * }} props
 */
export default function PressureChart({ data, leakAtReadingNo, isStreaming = false }) {
  const chart = useChartTheme();
  const series = pressureSeries(chart);
  const chartData = React.useMemo(() => {
    if (!data?.length) return [];
    return data.map((d) => ({
      readingNo: Number(d.readingNo),
      preComp: Number(d.preComp),
      postComp: Number(d.postComp),
      preTurbo: Number(d.preTurbo),
      postTurbo: Number(d.postTurbo),
    }));
  }, [data]);

  const showLeakArea = leakAtReadingNo != null;
  const isLeakInView = showLeakArea && chartData.some((d) => d.readingNo === leakAtReadingNo);
  const firstReadingInView = chartData[0]?.readingNo;

  return (
    <section className="section-card pressure-chart-card">
      <div className="section-card-header">
        <span className="section-card-title">REAL-TIME PRESSURE MONITORING</span>
      </div>
      <div className="section-card-body flush">
        <div className="pressure-chart-area">
          {chartData.length === 0 ? (
            <div className="dash-empty-state h-full min-h-[240px]">
              <span className="dash-empty-state-icon">📈</span>
              <span className="dash-empty-state-title">NO PRESSURE DATA YET</span>
              <span className="dash-empty-state-hint">
                {isStreaming
                  ? "Collecting readings — chart will populate within a few seconds."
                  : "Press START STREAMING at the top of the sidebar to begin real-time pressure monitoring."}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 8, left: -8, bottom: 4 }}
                style={{ background: "transparent" }}
              >
                <CartesianGrid stroke={chart.gridStroke} strokeDasharray="3 3" />
                <XAxis
                  dataKey="readingNo"
                  stroke={chart.axisLabel}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  tickFormatter={(v) => String(Math.floor(Number(v)))}
                  label={{ value: "Reading #", fill: chart.axisLabel, fontSize: 10, offset: -2 }}
                />
                <YAxis
                  stroke={chart.axisLabel}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  domain={[80, 260]}
                  tickFormatter={(v) => Number(v).toFixed(0)}
                  width={36}
                  label={{ value: "kPa", angle: -90, fill: chart.axisLabel, fontSize: 10, position: "insideLeft" }}
                />
                <Tooltip content={<PressureTooltip chart={chart} />} />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: 4, paddingBottom: 0 }}
                  payload={series.map((s) => ({
                    value: s.name,
                    type: "line",
                    color: s.stroke,
                    id: s.dataKey,
                  }))}
                  formatter={(value) => <span style={{ color: chart.legendText }}>{value}</span>}
                />
                {showLeakArea && (
                  <ReferenceArea
                    x1={Math.max(leakAtReadingNo, firstReadingInView)}
                    fill="#EF4444"
                    fillOpacity={0.08}
                    strokeOpacity={0}
                  />
                )}
                {isLeakInView && (
                  <ReferenceLine
                    x={leakAtReadingNo}
                    stroke="#EF4444"
                    strokeDasharray="6 4"
                    label={{
                      value: "LEAK DETECTED",
                      fill: "#EF4444",
                      fontSize: 10,
                      fontWeight: 700,
                      position: "insideTopLeft",
                    }}
                  />
                )}
                {showLeakArea && !isLeakInView && (
                  <ReferenceLine
                    x={firstReadingInView}
                    stroke="#EF4444"
                    strokeWidth={2}
                    label={{
                      value: "LEAK DETECTED (CONT.)",
                      fill: "#EF4444",
                      fontSize: 10,
                      fontWeight: 700,
                      position: "insideTopLeft",
                      dx: 4,
                    }}
                  />
                )}
                {series.map((s) => (
                  <Line
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.stroke}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={!isStreaming}
                    animationDuration={isStreaming ? 0 : 300}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
