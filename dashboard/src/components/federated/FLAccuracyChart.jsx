import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import useChartTheme from "../../hooks/useChartTheme.js";

export default function FLAccuracyChart({ data = [], isRunning = false }) {
  const chart = useChartTheme();
  const chartData = data.map((d) => ({
    round: `R${d.round}`,
    f1: parseFloat((d.f1 * 100).toFixed(3)),
  }));

  const yMin =
    chartData.length > 0
      ? Math.max(98, Math.min(...chartData.map((d) => d.f1)) - 0.5)
      : 98;

  return (
    <div
      style={{
        padding: "clamp(10px,1.2vh,14px) clamp(12px,1.5vw,20px)",
        height: "clamp(160px,22vh,220px)",
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid
            strokeDasharray="3 6"
            stroke={chart.gridStroke}
            vertical={false}
          />
          <XAxis
            dataKey="round"
            tick={{ fill: chart.tickFill, fontSize: 9 }}
            axisLine={{ stroke: chart.axisStroke }}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, 100.1]}
            tick={{ fill: chart.tickFill, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              background: chart.tooltipBg,
              border: `1px solid ${chart.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 11,
              color: chart.tooltipText,
            }}
            labelStyle={{ color: chart.tooltipLabel }}
            formatter={(v) => [`${v.toFixed(3)}%`, "Global F1"]}
          />
          <ReferenceLine
            y={99.7}
            stroke={chart.refLine}
            strokeDasharray="4 6"
            label={{
              value: "Convergence ~99.7%",
              fill: chart.refLabel,
              fontSize: 9,
              position: "insideTopRight",
            }}
          />
          <Line
            type="monotone"
            dataKey="f1"
            stroke={chart.line1}
            strokeWidth={1.5}
            dot={{ fill: chart.line1, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: chart.line2 }}
            animationDuration={isRunning ? 400 : 0}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
