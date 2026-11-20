import { useTheme } from "../context/ThemeContext.jsx";

export default function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return {
    gridStroke: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.07)",
    tickFill: isDark ? "rgba(255,255,255,0.30)" : "rgba(15,23,42,0.45)",
    axisStroke: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.10)",
    axisLabel: isDark ? "#64748B" : "#475569",
    tooltipBg: isDark ? "rgba(8,12,20,0.96)" : "rgba(255,255,255,0.98)",
    tooltipBorder: isDark ? "rgba(13,184,240,0.30)" : "rgba(8,145,178,0.30)",
    tooltipText: isDark ? "rgba(255,255,255,0.8)" : "rgba(15,23,42,0.8)",
    tooltipLabel: isDark ? "rgba(255,255,255,0.5)" : "rgba(15,23,42,0.55)",
    line1: isDark ? "#0DB8F0" : "#0891B2",
    line2: isDark ? "#10FFAA" : "#059669",
    line3: isDark ? "#A855F7" : "#7C3AED",
    line4: isDark ? "#FFB020" : "#D97706",
    line5: isDark ? "#FF4757" : "#DC2626",
    refLine: isDark ? "rgba(13,184,240,0.2)" : "rgba(8,145,178,0.25)",
    refLabel: isDark ? "rgba(13,184,240,0.4)" : "rgba(8,145,178,0.55)",
    areaFill1: isDark ? "rgba(13,184,240,0.08)" : "rgba(8,145,178,0.07)",
    areaFill2: isDark ? "rgba(10,255,170,0.06)" : "rgba(5,150,105,0.06)",
    legendText: isDark ? "#E2E8F0" : "#1E293B",
  };
}
