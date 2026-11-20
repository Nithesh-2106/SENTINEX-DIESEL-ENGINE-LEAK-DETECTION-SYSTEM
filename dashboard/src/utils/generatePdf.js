/**
 * PDF Report Generator — Caterpillar-branded test cell session report.
 */
import { jsPDF } from "jspdf";
import { SCENARIO_LABELS, MULTI_LEAK_SCENARIOS } from "../simulator.js";
import {
  countLeakLocationsInSegment,
  countTotalLeakLocations,
  summarizeScenarioValidation,
} from "./sessionReport.js";
import { displayModelName, formatModelAccuracy } from "./modelSelection.js";

const COLORS = {
  catYellow: [255, 184, 0],
  darkNavy: [13, 27, 42],
  midNavy: [27, 45, 66],
  white: [255, 255, 255],
  lightGrey: [240, 240, 240],
  medGrey: [150, 150, 150],
  darkGrey: [60, 60, 60],
  green: [34, 197, 94],
  red: [239, 68, 68],
  amber: [245, 158, 11],
  blue: [8, 145, 178],
};

export function formatTime(date) {
  if (!date) return "N/A";
  return new Date(date).toLocaleTimeString("en-IN");
}

export function formatDuration(start, end) {
  if (!start || !end) return "N/A";
  const ms = new Date(end) - new Date(start);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function formatDateForFilename(date) {
  if (!date) return "unknown";
  return new Date(date).toISOString().slice(0, 10).replace(/-/g, "");
}

export function getOverallStatus(sessionLog) {
  const hasLeak = (sessionLog.leakEvents || []).length > 0;
  const hasFault = (sessionLog.sensorFaults || []).length > 0;
  const hasModerate = (sessionLog.leakEvents || []).some(
    (e) => e.leakSeverity === "Moderate"
  );
  const hasSevere = (sessionLog.leakEvents || []).some(
    (e) => e.leakSeverity === "Severe"
  );

  if (hasSevere) {
    return {
      text: "STOP — Immediate Inspection Required",
      icon: "STOP",
      color: [180, 0, 0],
      bgColor: [255, 220, 220],
      textColor: [180, 0, 0],
    };
  }
  if (hasModerate) {
    return {
      text: "ACTION NEEDED — Inspect Components",
      icon: "WARN",
      color: [180, 80, 0],
      bgColor: [255, 240, 220],
      textColor: [180, 80, 0],
    };
  }
  if (hasLeak) {
    return {
      text: "FLAGGED — Monitor Closely",
      icon: "WARN",
      color: [150, 100, 0],
      bgColor: [255, 251, 220],
      textColor: [150, 100, 0],
    };
  }
  if (hasFault) {
    return {
      text: "MAINTENANCE — Check Sensor Hardware",
      icon: "MAINT",
      color: [150, 100, 0],
      bgColor: [255, 245, 220],
      textColor: [150, 100, 0],
    };
  }
  return {
    text: "PASS — Continue Testing",
    icon: "PASS",
    color: [0, 120, 0],
    bgColor: [220, 255, 220],
    textColor: [0, 120, 0],
  };
}

function getAvgConfidence(sessionLog) {
  const leaks = sessionLog.leakEvents || [];
  if (!leaks.length) return "N/A";
  const avg =
    leaks.reduce((s, e) => s + (e.confidence || 0), 0) / leaks.length;
  return `${avg.toFixed(1)}%`;
}

function getAvgDqpScore(sessionLog) {
  const leaks = sessionLog.leakEvents || [];
  if (!leaks.length) return "100/100";
  const avg =
    leaks.reduce((s, e) => s + (e.dqpScore || 100), 0) / leaks.length;
  return `${avg.toFixed(1)}/100`;
}

function getDqpEventCount(sessionLog) {
  return (sessionLog.dqpEvents || []).length;
}

function getSsgEventCount(sessionLog) {
  return (sessionLog.ssgEvents || []).length;
}

function formatLoc(loc) {
  return (loc || "").replace(/_/g, " ");
}

function mapShapDrivers(rows) {
  return (rows || []).map((d) => ({
    sensor: d.sensor,
    yourValue: d.your_value ?? d.yourValue,
    baseline: d.normal_baseline ?? d.baseline,
    deviation_pct: d.deviation_pct ?? d.deviationPct ?? 0,
  }));
}

function getActiveLeaksFromEvent(event) {
  if (event.activeLeakDetails?.length >= 2) return event.activeLeakDetails;
  if (event.isMultiLeak && event.multiPattern) {
    const mp = event.multiPattern;
    const primary = {
      location: mp.primary_location || event.leakLocation,
      severity: event.leakSeverity,
      confidence: event.confidence,
      shapDrivers: event.shapDrivers,
    };
    const secondary = {
      location: mp.secondary_location,
      severity: mp.secondary_severity || event.leakSeverity,
      confidence:
        (mp.location_probs?.[mp.secondary_location] ?? event.confidence / 100) * 100,
      shapDrivers: event.secondaryShapDrivers || [],
    };
    if (secondary.location) return [primary, secondary];
  }
  return [];
}

function countMultiLeakEvents(sessionLog) {
  return (sessionLog.leakEvents || []).filter(
    (e) => e.isMultiLeak || getActiveLeaksFromEvent(e).length >= 2
  ).length;
}

function drawShapDriverRows(doc, drivers, leftX, startY, helpers) {
  const { setFont, setColor, COLORS, CONTENT_W, MARGIN } = helpers;
  let y = startY;
  (drivers || []).slice(0, 3).forEach((driver) => {
    const devPct = driver.deviation_pct ?? driver.deviationPct ?? 0;
    const barW = Math.min(60, Math.abs(devPct) * 3);
    const barCol = devPct < 0 ? COLORS.red : COLORS.green;

    setFont(7);
    setColor(COLORS.darkGrey);
    doc.text(
      (driver.sensor || "")
        .replace(/_/g, " ")
        .replace("kPa", "")
        .replace("kgph", "")
        .trim()
        .substring(0, 28),
      leftX,
      y
    );
    doc.text(
      `${devPct > 0 ? "+" : ""}${Number(devPct).toFixed(1)}%`,
      leftX + 125,
      y
    );
    doc.setFillColor(barCol[0], barCol[1], barCol[2]);
    doc.rect(leftX + 90, y - 3, barW * 0.4, 3, "F");
    y += 5;
  });
  return y;
}

export function generateSessionReport(sessionLog) {
  const { doc, filename } = buildSessionReportDocument(sessionLog);
  doc.save(filename);
  return filename;
}

/** Returns base64 PDF bytes for SMTP / API upload. */
export function generateSessionReportBlob(sessionLog) {
  const { doc, filename } = buildSessionReportDocument(sessionLog);
  const dataUri = doc.output("datauristring", { filename });
  const base64 = dataUri.includes(",") ? dataUri.split(",", 2)[1] : dataUri;
  if (!base64) {
    throw new Error("Failed to encode session report PDF");
  }
  return {
    filename,
    base64,
    mimeType: "application/pdf",
  };
}

function buildSessionReportDocument(sessionLog) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const PAGE_W = 210;
  const MARGIN = 15;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = 0;

  function setFont(size, style = "normal") {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  }

  function setColor(rgb) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  function setFill(rgb) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  function setDraw(rgb) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }

  function drawText(str, x, yPos, align = "left") {
    doc.text(String(str), x, yPos, { align });
  }

  function addPageFooter() {
    const pageNum = doc.getCurrentPageInfo().pageNumber;
    setFont(8);
    setColor(COLORS.medGrey);
    doc.text(
      `Caterpillar Leak Detection System v1.0  |  Tech Challenge 2026  |  Page ${pageNum}`,
      PAGE_W / 2,
      292,
      { align: "center" }
    );
  }

  function addPage() {
    doc.addPage();
    y = 15;
    addPageFooter();
  }

  function checkPageBreak(neededSpace) {
    if (y + neededSpace > 280) addPage();
  }

  // ── PAGE 1 HEADER ──
  setFill(COLORS.darkNavy);
  doc.rect(0, 0, PAGE_W, 45, "F");
  setFill(COLORS.catYellow);
  doc.rect(0, 0, 5, 45, "F");

  setFont(20, "bold");
  setColor(COLORS.catYellow);
  drawText("CATERPILLAR", MARGIN + 5, 14);

  setFont(11);
  setColor(COLORS.white);
  drawText("Diesel Engine Leak Detection System", MARGIN + 5, 22);

  setFont(9);
  setColor(COLORS.medGrey);
  drawText("Test Cell Inspection Report", MARGIN + 5, 29);

  setFont(9);
  setColor(COLORS.medGrey);
  drawText(
    new Date(sessionLog.startTime || Date.now()).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    PAGE_W - MARGIN,
    14,
    "right"
  );

  y = 55;

  // ── SESSION INFORMATION ──
  setFill(COLORS.lightGrey);
  doc.rect(MARGIN, y, CONTENT_W, sessionLog.testerName ? 48 : 42, "F");
  setDraw(COLORS.medGrey);
  doc.rect(MARGIN, y, CONTENT_W, sessionLog.testerName ? 48 : 42, "S");
  setFill(COLORS.catYellow);
  doc.rect(MARGIN, y, CONTENT_W, 1.5, "F");

  y += 7;
  setFont(10, "bold");
  setColor(COLORS.darkGrey);
  drawText("SESSION INFORMATION", MARGIN + 4, y);

  y += 7;
  const col1x = MARGIN + 4;
  const col2x = MARGIN + 55;
  const col3x = MARGIN + 110;
  const col4x = MARGIN + 155;

  const duration = sessionLog.endTime
    ? formatDuration(sessionLog.startTime, sessionLog.endTime)
    : "In Progress";

  const infoRows = [
    ["Session ID", sessionLog.sessionId || "N/A"],
    ["Engine", sessionLog.engineName || sessionLog.engineId],
    ["Serial No.", sessionLog.engineSerial || "N/A"],
    ["Test Cell", sessionLog.testCellId || "TC-CELL-03"],
  ];
  const infoRows2 = [
    ["Start Time", formatTime(sessionLog.startTime)],
    ["End Time", formatTime(sessionLog.endTime)],
    ["Duration", duration],
    ["Readings", (sessionLog.totalReadings || 0).toLocaleString()],
  ];

  setFont(8);
  infoRows.forEach((row, i) => {
    const rowY = y + i * 6;
    setColor(COLORS.medGrey);
    doc.text(`${row[0]}:`, col1x, rowY);
    setColor(COLORS.darkGrey);
    doc.text(String(row[1]), col2x, rowY);
  });
  infoRows2.forEach((row, i) => {
    const rowY = y + i * 6;
    setColor(COLORS.medGrey);
    doc.text(`${row[0]}:`, col3x, rowY);
    setColor(COLORS.darkGrey);
    doc.text(String(row[1]), col4x, rowY);
  });

  if (sessionLog.testerName || sessionLog.bayId) {
    const opY = y + 24;
    if (sessionLog.testerName) {
      setColor(COLORS.medGrey);
      doc.text("Operator:", col1x, opY);
      setColor(COLORS.darkGrey);
      doc.setFont("helvetica", "bold");
      doc.text(String(sessionLog.testerName), col2x, opY);
      doc.setFont("helvetica", "normal");
    }
    if (sessionLog.bayId) {
      setColor(COLORS.medGrey);
      doc.text("Bay:", col3x, opY);
      setColor(COLORS.darkGrey);
      doc.text(String(sessionLog.bayId), col4x, opY);
    }
  }

  y += sessionLog.testerName ? 38 : 32;

  // ── EXECUTIVE SUMMARY ──
  y += 8;
  setFont(11, "bold");
  setColor(COLORS.darkNavy);
  drawText("EXECUTIVE SUMMARY", MARGIN, y);

  y += 2;
  setDraw(COLORS.catYellow);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.setLineWidth(0.2);
  y += 6;

  const statBoxW = (CONTENT_W - 9) / 4;
  const leakCount = (sessionLog.leakEvents || []).length;
  const leakLocationTotal = countTotalLeakLocations(sessionLog);
  const multiLeakCount = countMultiLeakEvents(sessionLog);
  const faultCount = (sessionLog.sensorFaults || []).length;
  const dqpCount = getDqpEventCount(sessionLog);
  const ssgCount = getSsgEventCount(sessionLog);

  const stats = [
    {
      val: leakLocationTotal,
      label: multiLeakCount > 0 ? "Leak Locations" : "Leak Locations",
      color: leakLocationTotal > 0 ? COLORS.red : COLORS.green,
    },
    {
      val: faultCount,
      label: "Sensor Faults",
      color: faultCount > 0 ? COLORS.amber : COLORS.green,
    },
    {
      val: dqpCount,
      label: "DQP Events",
      color: COLORS.blue,
    },
    {
      val: ssgCount,
      label: "SSG Suppressions",
      color: COLORS.medGrey,
    },
  ];

  stats.forEach((stat, i) => {
    const bx = MARGIN + i * (statBoxW + 3);
    setFill(COLORS.lightGrey);
    doc.rect(bx, y, statBoxW, 18, "F");
    setFill(stat.color);
    doc.rect(bx, y, statBoxW, 1.5, "F");
    setFont(16, "bold");
    setColor(stat.color);
    doc.text(String(stat.val), bx + statBoxW / 2, y + 10, { align: "center" });
    setFont(7);
    setColor(COLORS.medGrey);
    doc.text(stat.label, bx + statBoxW / 2, y + 15, { align: "center" });
  });

  y += 22;

  const status = getOverallStatus(sessionLog);
  setFill(status.bgColor);
  doc.rect(MARGIN, y, CONTENT_W, 10, "F");
  setFill(status.color || status.textColor);
  doc.rect(MARGIN + 2, y + 2, 6, 6, "F");
  setFont(10, "bold");
  setColor(status.textColor);
  doc.text(status.text, MARGIN + 12, y + 6.5);
  y += 16;

  // ── SCENARIO VALIDATION ──
  const validation = summarizeScenarioValidation(sessionLog);
  if (validation.total > 0) {
    checkPageBreak(14 + validation.total * 7);
    y += 2;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("SCENARIO VALIDATION", MARGIN, y);
    y += 2;
    setDraw(COLORS.blue);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 5;
    setFont(7);
    setColor(COLORS.medGrey);
    doc.text(
      `Verdict: ${validation.pass}/${validation.total} passed · expected injection vs ML detection`,
      MARGIN,
      y
    );
    y += 6;
    validation.results.forEach((row, idx) => {
      checkPageBreak(10);
      const pass = row.status === "pass";
      setFont(8, "bold");
      setColor(COLORS.darkGrey);
      doc.text(`${idx + 1}. ${row.segment.label}`, MARGIN + 2, y);
      setFont(7);
      setColor(COLORS.medGrey);
      doc.text(`Expected: ${row.expectedLabel}`, MARGIN + 4, y + 4);
      doc.text(`Detected: ${row.detectedLabel}`, MARGIN + 4, y + 8);
      setFont(8, "bold");
      setColor(pass ? COLORS.green : row.status === "miss" ? COLORS.amber : COLORS.red);
      doc.text(row.statusLabel, PAGE_W - MARGIN - 2, y + 4, { align: "right" });
      y += 12;
    });
    y += 2;
  }

  // ── LEAK EVENTS ──
  const leakEvents = sessionLog.leakEvents || [];
  if (leakEvents.length > 0) {
    checkPageBreak(20);
    y += 4;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("LEAK EVENTS DETECTED", MARGIN, y);
    y += 2;
    setDraw(COLORS.catYellow);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 6;

    leakEvents.forEach((event) => {
      const activeLeaks = getActiveLeaksFromEvent(event);
      const isMulti = event.isMultiLeak || activeLeaks.length >= 2;
      const hasRca = !isMulti && (event.rcaResult?.rankedCauses?.length ?? 0) > 0;
      const cardH = isMulti ? 118 : hasRca ? 92 : 70;
      checkPageBreak(cardH + 10);

      setFill(COLORS.lightGrey);
      doc.rect(MARGIN, y, CONTENT_W, cardH, "F");
      setDraw(COLORS.medGrey);
      doc.rect(MARGIN, y, CONTENT_W, cardH, "S");

      const sevColor =
        event.leakSeverity === "Minor"
          ? COLORS.amber
          : event.leakSeverity === "Moderate"
            ? COLORS.red
            : COLORS.red;
      const barColor = isMulti ? [124, 58, 237] : sevColor;
      setFill(barColor);
      doc.rect(MARGIN, y, 3, cardH, "F");

      setFill(isMulti ? [45, 25, 70] : COLORS.midNavy);
      doc.rect(MARGIN + 3, y, CONTENT_W - 3, 10, "F");
      setFont(9, "bold");
      setColor(COLORS.catYellow);
      doc.text(
        isMulti ? `MULTI-LEAK EVENT ${event.eventId}` : `EVENT ${event.eventId}`,
        MARGIN + 7,
        y + 6.5
      );
      setColor(COLORS.white);
      doc.text(event.timestamp || "", PAGE_W - MARGIN - 2, y + 6.5, {
        align: "right",
      });

      y += 13;
      const leftX = MARGIN + 5;
      const rightX = MARGIN + 95;

      if (isMulti && activeLeaks.length >= 2) {
        activeLeaks.slice(0, 2).forEach((leak, idx) => {
          const role = idx === 0 ? "PRIMARY" : "SECONDARY";
          const accent = idx === 0 ? COLORS.red : [124, 58, 237];
          const rca = (event.multiRcaResults || [])[idx];

          setFill(idx === 0 ? [255, 235, 235] : [245, 235, 255]);
          doc.rect(leftX - 1, y - 2, CONTENT_W - 8, 22, "F");

          setFont(8, "bold");
          setColor(accent);
          doc.text(`${role} LEAK`, leftX, y + 2);
          setColor(COLORS.darkGrey);
          doc.text(formatLoc(leak.location), leftX + 28, y + 2);

          setFont(7);
          setColor(COLORS.medGrey);
          doc.text("Severity:", leftX, y + 8);
          setColor(accent);
          setFont(7, "bold");
          doc.text(leak.severity || "N/A", leftX + 18, y + 8);

          setFont(7);
          setColor(COLORS.medGrey);
          doc.text("Confidence:", rightX, y + 2);
          setColor(COLORS.darkGrey);
          setFont(7, "bold");
          const leakConf = leak.confidence != null
            ? Number(leak.confidence)
            : Number(event.confidence || 0);
          doc.text(`${leakConf.toFixed(1)}%`, rightX + 22, y + 2);

          if (rca?.topCause || rca?.rankedCauses?.[0]) {
            const cause = rca.rankedCauses?.[0];
            setFont(7);
            setColor(COLORS.medGrey);
            doc.text("Top RCA:", leftX, y + 14);
            setColor(COLORS.darkGrey);
            doc.text(
              `${cause?.label || rca.topCause} (${cause?.probabilityPct || rca.topCausePct || "—"})`,
              leftX + 18,
              y + 14
            );
          }

          y += 24;
        });

        if (event.scenarioLabel) {
          setFont(7);
          setColor(COLORS.medGrey);
          doc.text("Scenario:", leftX, y);
          setColor(COLORS.darkGrey);
          doc.text(event.scenarioLabel, leftX + 18, y);
          y += 5;
        }

        setFont(8, "bold");
        setColor(COLORS.darkNavy);
        doc.text("PER-LEAK SHAP DRIVERS:", leftX, y);
        y += 5;

        activeLeaks.slice(0, 2).forEach((leak, idx) => {
          setFont(7, "bold");
          setColor(idx === 0 ? COLORS.red : [124, 58, 237]);
          doc.text(`${idx === 0 ? "Primary" : "Secondary"} — ${formatLoc(leak.location)}`, leftX, y);
          y += 4;
          y = drawShapDriverRows(
            doc,
            leak.shapDrivers || mapShapDrivers(leak.top_5_sensors_driving_prediction),
            leftX,
            y,
            { setFont, setColor, COLORS, CONTENT_W, MARGIN }
          );
          y += 2;
        });
      } else {
        setFont(8);
        setColor(COLORS.medGrey);
        doc.text("Location:", leftX, y);
        setColor(COLORS.darkGrey);
        setFont(8, "bold");
        doc.text(formatLoc(event.leakLocation), leftX + 22, y);

        setFont(8);
        setColor(COLORS.medGrey);
        doc.text("Confidence:", rightX, y);
        setColor(COLORS.darkGrey);
        setFont(8, "bold");
        doc.text(`${Number(event.confidence || 0).toFixed(2)}%`, rightX + 25, y);

        y += 6;
        setFont(8);
        setColor(COLORS.medGrey);
        doc.text("Severity:", leftX, y);
        setColor(sevColor);
        setFont(8, "bold");
        doc.text(event.leakSeverity || "N/A", leftX + 22, y);

        if (event.performanceImpactPct > 0) {
          y += 6;
          setFont(8);
          setColor(COLORS.medGrey);
          doc.text("Perf. Impact:", leftX, y);
          setColor(COLORS.darkGrey);
          setFont(8, "bold");
          doc.text(
            `${Number(event.performanceImpactPct).toFixed(1)}%  ${event.impactBasis || ""}`,
            leftX + 22,
            y
          );
        }

        y += 6;
        setFont(8);
        setColor(COLORS.medGrey);
        doc.text("Action:", rightX, y);
        setColor(COLORS.darkGrey);
        setFont(8, "bold");
        doc.text(
          (event.recommendedAction || "").replace(/_/g, " "),
          rightX + 18,
          y
        );

        y += 6;
        setFont(8);
        setColor(COLORS.medGrey);
        doc.text("Reading #:", leftX, y);
        setColor(COLORS.darkGrey);
        doc.text(String(event.readingNumber || ""), leftX + 22, y);

        setColor(COLORS.medGrey);
        doc.text("Operating:", rightX, y);
        setColor(COLORS.darkGrey);
        doc.text(
          `${event.engineRpm || 1800} RPM / ${event.engineLoad || 75}% load`,
          rightX + 20,
          y
        );

        if (hasRca) {
          y += 7;
          setFont(8, "bold");
          setColor(COLORS.darkNavy);
          doc.text("ROOT CAUSE ANALYSIS:", leftX, y);
          y += 5;
          setFont(7);
          (event.rcaResult.rankedCauses || []).slice(0, 3).forEach((cause, idx) => {
            setColor(COLORS.darkGrey);
            doc.text(
              `${idx + 1}. ${cause.label} (${cause.probabilityPct || "—"})`,
              leftX + 2,
              y
            );
            y += 4;
          });
        }

        y += 7;
        setFont(8, "bold");
        setColor(COLORS.darkNavy);
        doc.text("TOP SHAP SENSORS:", leftX, y);
        y += 5;
        y = drawShapDriverRows(doc, event.shapDrivers, leftX, y, {
          setFont, setColor, COLORS, CONTENT_W, MARGIN,
        });
      }

      y += 3;
      setFill([230, 255, 230]);
      doc.rect(leftX - 1, y - 3, CONTENT_W - 7, 14, "F");
      setDraw(COLORS.green);
      doc.rect(leftX - 1, y - 3, CONTENT_W - 7, 14, "S");

      setFont(8, "bold");
      setColor(COLORS.green);
      doc.text(
        event.sfiConfirmed
          ? `✓ LEAK PATTERN CONFIRMED — ${event.sfiPatternCheck || ""}`
          : "⚠ Pattern unconfirmed",
        leftX,
        y + 1
      );

      setFont(7);
      setColor(COLORS.darkGrey);
      const basisLines = doc.splitTextToSize(
        event.sfiPhysicalBasis || "",
        CONTENT_W - 10
      );
      doc.text(basisLines.slice(0, 1), leftX, y + 7);

      y += 18;
      if (isMulti) {
        setFont(7, "italic");
        setColor(COLORS.darkGrey);
        doc.text(
          "Both failure modes are physically independent — inspect each leak origin separately.",
          leftX,
          y
        );
        y += 6;
      }

      y += 4;
    });
  } else {
    setFill([230, 255, 230]);
    doc.rect(MARGIN, y, CONTENT_W, 12, "F");
    setFont(10, "bold");
    setColor(COLORS.green);
    doc.text(
      "✓ No leak events detected during this session.",
      PAGE_W / 2,
      y + 7.5,
      { align: "center" }
    );
    y += 16;
  }

  // ── SENSOR FAULT EVENTS ──
  const sensorFaults = sessionLog.sensorFaults || [];
  if (sensorFaults.length > 0) {
    checkPageBreak(20);
    y += 4;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("SENSOR FAULT EVENTS", MARGIN, y);
    y += 2;
    setDraw(COLORS.amber);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 6;

    sensorFaults.forEach((fault) => {
      checkPageBreak(30);
      setFill([255, 251, 235]);
      doc.rect(MARGIN, y, CONTENT_W, 28, "F");
      setDraw(COLORS.amber);
      doc.rect(MARGIN, y, CONTENT_W, 28, "S");
      setFill(COLORS.amber);
      doc.rect(MARGIN, y, 3, 28, "F");

      setFill(COLORS.midNavy);
      doc.rect(MARGIN + 3, y, CONTENT_W - 3, 8, "F");
      setFont(9, "bold");
      setColor(COLORS.amber);
      doc.text(`FAULT ${fault.eventId}`, MARGIN + 7, y + 5.5);
      setColor(COLORS.white);
      doc.text(fault.timestamp || "", PAGE_W - MARGIN - 2, y + 5.5, {
        align: "right",
      });

      y += 11;
      const lx = MARGIN + 5;
      setFont(8);
      setColor(COLORS.medGrey);
      doc.text("Sensor:", lx, y);
      setColor(COLORS.darkGrey);
      setFont(8, "bold");
      doc.text((fault.faultedSensor || "").replace(/_/g, " "), lx + 18, y);

      y += 5;
      setFont(8);
      setColor(COLORS.medGrey);
      doc.text("Action:", lx, y);
      setColor(COLORS.amber);
      setFont(8, "bold");
      doc.text(
        (fault.actionTaken || "").replace(/_/g, " "),
        lx + 18,
        y
      );

      y += 5;
      setFont(7);
      setColor(COLORS.darkGrey);
      const reasonLines = doc.splitTextToSize(
        fault.faultReason || "",
        CONTENT_W - 10
      );
      doc.text(reasonLines.slice(0, 2), lx, y);
      y += 10;
    });
  }

  // ── DQP EVENT LOG ──
  const dqpEvents = sessionLog.dqpEvents || [];
  if (dqpEvents.length > 0) {
    checkPageBreak(24);
    y += 4;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("DATA QUALITY EVENTS (DQP)", MARGIN, y);
    y += 2;
    setDraw(COLORS.blue);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 5;
    setFont(7);
    setColor(COLORS.medGrey);
    doc.text(`Showing ${Math.min(12, dqpEvents.length)} of ${dqpEvents.length} flagged readings`, MARGIN, y);
    y += 5;
    dqpEvents.slice(0, 12).forEach((evt) => {
      checkPageBreak(6);
      const flags = (evt.flags || []).map((f) => f.severity).join(", ");
      setColor(COLORS.darkGrey);
      doc.text(
        `#${evt.readingNumber} · ${evt.timestamp || "—"} · score ${evt.score ?? "—"} · ${flags || "flag"}`,
        MARGIN + 2,
        y
      );
      y += 4;
    });
    y += 4;
  }

  // ── SSG SUPPRESSION LOG ──
  const ssgEvents = sessionLog.ssgEvents || [];
  if (ssgEvents.length > 0) {
    checkPageBreak(20);
    y += 2;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("STEADY-STATE GUARD (SSG)", MARGIN, y);
    y += 2;
    setDraw(COLORS.medGrey);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 5;
    ssgEvents.slice(0, 12).forEach((evt) => {
      checkPageBreak(6);
      setFont(7);
      setColor(COLORS.darkGrey);
      const reason = (evt.reason || "Transient state").slice(0, 70);
      doc.text(`#${evt.readingNumber} · ${evt.timestamp || "—"} · ${reason}`, MARGIN + 2, y);
      y += 4;
    });
    y += 4;
  }

  // ── SYSTEM PERFORMANCE ──
  checkPageBreak(55);
  y += 4;
  setFont(11, "bold");
  setColor(COLORS.darkNavy);
  drawText("SYSTEM PERFORMANCE", MARGIN, y);
  y += 2;
  setDraw(COLORS.catYellow);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.setLineWidth(0.2);
  y += 6;

  setFill(COLORS.lightGrey);
  doc.rect(MARGIN, y, CONTENT_W, 40, "F");
  setFill(COLORS.catYellow);
  doc.rect(MARGIN, y, CONTENT_W, 1.5, "F");

  y += 8;
  const perfData = [
    [
      "Detection Engine",
      sessionLog.activeModelName ||
        displayModelName(sessionLog.activeModelId, "Multilabel RF"),
    ],
    ["Model Accuracy", sessionLog.activeModelAccuracy != null
      ? formatModelAccuracy(sessionLog.activeModelAccuracy)
      : "—"],
    ["Total Readings", (sessionLog.totalReadings || 0).toLocaleString()],
    ["Leak Locations", String(leakLocationTotal)],
    ["Scenario Detections", String(leakCount)],
    ["Sensor Faults", String(faultCount)],
    ["Avg Confidence", getAvgConfidence(sessionLog)],
    ["Avg DQP Score", getAvgDqpScore(sessionLog)],
    ["Response Time", "< 1 second"],
    ["Engine Config", sessionLog.engineName || sessionLog.engineId],
  ];

  const halfLen = Math.ceil(perfData.length / 2);
  perfData.forEach((row, i) => {
    const col = i < halfLen ? 0 : 1;
    const rowI = i < halfLen ? i : i - halfLen;
    const px = MARGIN + col * 95 + 5;
    const py = y + rowI * 6;

    setFont(8);
    setColor(COLORS.medGrey);
    doc.text(`${row[0]}:`, px, py);
    setColor(COLORS.darkGrey);
    setFont(8, "bold");
    doc.text(row[1], px + 45, py);
  });

  y += halfLen * 6 + 6;

  // Scenario timeline (reading ranges per demo scenario)
  const segments = sessionLog.scenarioSegments || [];
  if (segments.length > 0) {
    checkPageBreak(12 + segments.length * 5);
    y += 4;
    setFont(10, "bold");
    setColor(COLORS.darkNavy);
    drawText("SCENARIO RUN TIMELINE", MARGIN, y);
    y += 5;
    setFont(7);
    setColor(COLORS.medGrey);
    doc.text(
      "Locations = concurrent leak sites (multi-leak rows count as 2).",
      MARGIN,
      y
    );
    y += 5;
    segments.forEach((seg, idx) => {
      const end = seg.endReading ?? sessionLog.totalReadings ?? seg.startReading;
      const leakLocN = countLeakLocationsInSegment(
        sessionLog.leakEvents,
        seg,
        sessionLog.totalReadings
      );
      const faultN = (sessionLog.sensorFaults || []).filter(
        (e) => e.readingNumber >= seg.startReading && e.readingNumber <= end
      ).length;
      const isMulti = String(seg.label).includes("Multi:");
      setFont(8, "bold");
      setColor(isMulti ? [124, 58, 237] : COLORS.darkGrey);
      doc.text(`${idx + 1}. ${seg.label}`, MARGIN + 2, y);
      setFont(7);
      setColor(COLORS.medGrey);
      doc.text(
        `readings ${seg.startReading}–${end} · locations ${leakLocN || "—"} · SFI ${faultN || "—"}`,
        MARGIN + 2,
        y + 4
      );
      y += 9;
    });
    y += 2;
  }

  // Scenarios run
  const scenarios = sessionLog.scenarioHistory || [];
  const hasMultiScenario = scenarios.some((sc) => String(sc).includes("Multi:"))
    || multiLeakCount > 0;

  if (scenarios.length > 0) {
    checkPageBreak(15);
    setFont(8, "bold");
    setColor(COLORS.darkGrey);
    doc.text("Scenarios Run:", MARGIN + 5, y);
    y += 5;
    setFont(7);
    setColor(COLORS.medGrey);
    scenarios.slice(0, 10).forEach((sc, i) => {
      const isMulti = String(sc).includes("Multi:");
      if (isMulti) setColor([124, 58, 237]);
      doc.text(`• ${sc}`, MARGIN + 5, y + i * 4);
      if (isMulti) setColor(COLORS.medGrey);
    });
    y += Math.min(scenarios.length, 10) * 4 + 4;
  }

  if (hasMultiScenario) {
    checkPageBreak(55);
    y += 4;
    setFont(11, "bold");
    setColor(COLORS.darkNavy);
    drawText("MULTI-LEAK SCENARIO REFERENCE", MARGIN, y);
    y += 2;
    setDraw([124, 58, 237]);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.setLineWidth(0.2);
    y += 6;

    setFont(7);
    setColor(COLORS.medGrey);
    const intro = doc.splitTextToSize(
      "SENTINEX supports 7 dataset multi-leak combinations. Each row is two independent failure modes detected simultaneously by the multilabel RF model (threshold 0.50 per label).",
      CONTENT_W - 4
    );
    doc.text(intro, MARGIN + 2, y);
    y += intro.length * 3.5 + 4;

    MULTI_LEAK_SCENARIOS.forEach((sc) => {
      checkPageBreak(8);
      const ran = scenarios.includes(SCENARIO_LABELS[sc.id]);
      setFont(7, ran ? "bold" : "normal");
      setColor(ran ? [124, 58, 237] : COLORS.darkGrey);
      doc.text(
        `${ran ? "▸ " : "  "}${SCENARIO_LABELS[sc.id] || sc.id}`,
        MARGIN + 2,
        y
      );
      setFont(6);
      setColor(COLORS.medGrey);
      doc.text(sc.combo.replace(/\+/g, " + "), MARGIN + 95, y);
      y += 4.5;
    });
    y += 4;
  }

  // ── FOOTER ──
  checkPageBreak(20);
  y += 6;
  setFill(COLORS.darkNavy);
  doc.rect(MARGIN, y, CONTENT_W, 18, "F");
  setFont(8);
  setColor(COLORS.medGrey);
  doc.text(
    "Generated by: Caterpillar Diesel Engine Leak Detection System v1.0",
    PAGE_W / 2,
    y + 6,
    { align: "center" }
  );
  doc.text(
    "Caterpillar Tech Challenge 2026  |  Problem Statement 3  |  CONFIDENTIAL",
    PAGE_W / 2,
    y + 12,
    { align: "center" }
  );

  addPageFooter();

  const filename = [
    "CAT_LeakReport",
    sessionLog.engineId || "CAT_C13",
    sessionLog.testCellId || "TC-CELL-03",
    formatDateForFilename(sessionLog.startTime),
  ].join("_") + ".pdf";

  return { doc, filename };
}
