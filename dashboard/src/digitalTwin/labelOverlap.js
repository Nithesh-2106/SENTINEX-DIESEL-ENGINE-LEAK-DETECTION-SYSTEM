/**
 * Label overlap resolution for screen-space sensor / zone labels.
 */
import { AIR_PATH_SEQUENCE } from "../constants/sensorDefinitions.js";

const LABEL_WIDTH = 80;
const LABEL_HEIGHT = 24;
const PADDING = 4;

/** Per-zone label box size (engine block is tallest — 4 text lines) */
const ZONE_DIMS = {
  zone_block: { w: 132, h: 78 },
  zone_egr: { w: 128, h: 58 },
  zone_cac: { w: 120, h: 54 },
  zone_airfilter: { w: 120, h: 54 },
  zone_turbo: { w: 130, h: 54 },
  zone_aftertreat: { w: 120, h: 54 },
  zone_scr: { w: 100, h: 50 },
  zone_exhaust: { w: 120, h: 54 },
};

/** Higher priority = stays put; lower priority gets pushed away */
const ZONE_PRIORITY = {
  zone_block: 10,
  zone_turbo: 7,
  zone_airfilter: 7,
  zone_cac: 6,
  zone_aftertreat: 5,
  zone_scr: 5,
  zone_exhaust: 5,
  zone_egr: 2,
};

function zoneDim(id) {
  return ZONE_DIMS[id] || { w: 120, h: 52 };
}

function zonePriority(id) {
  return ZONE_PRIORITY[id] ?? 5;
}

export function resolveOverlaps(labelPositions) {
  const resolved = labelPositions.map((p) => ({
    ...p,
    labelOffsetX: p.labelOffsetX ?? 0,
    labelOffsetY: p.labelOffsetY ?? 0,
  }));

  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        const ax = a.screenX + a.labelOffsetX;
        const ay = a.screenY + a.labelOffsetY;
        const bx = b.screenX + b.labelOffsetX;
        const by = b.screenY + b.labelOffsetY;
        const dx = bx - ax;
        const dy = by - ay;
        const minDX = LABEL_WIDTH + PADDING;
        const minDY = LABEL_HEIGHT + PADDING;

        if (Math.abs(dx) < minDX && Math.abs(dy) < minDY) {
          const pushX = (minDX - Math.abs(dx)) / 2;
          const pushY = (minDY - Math.abs(dy)) / 2;
          const signX = dx >= 0 ? 1 : -1;
          const signY = dy >= 0 ? 1 : -1;
          b.labelOffsetX += signX * pushX;
          b.labelOffsetY += signY * pushY;
          a.labelOffsetX -= signX * pushX;
          a.labelOffsetY -= signY * pushY;
        }
      }
    }
  }
  return resolved;
}

const ALL_SENSOR_LABEL_W = 108;
const ALL_SENSOR_LABEL_H = 36;
const ALL_SENSOR_PAD = 6;

const COLUMN_LEFT_COMPONENTS = new Set([
  "AIR_FILTER", "TURBOCHARGER", "CAC", "EGR_COOLER",
]);
const COMPONENT_RANK = Object.fromEntries(
  AIR_PATH_SEQUENCE.map((key, index) => [key, index]),
);

const COLUMN_SAFE = {
  top: 86,
  bottom: 92,
  bottomLeft: 196,
  left: 112,
  right: 14,
  pillWidth: 118,
  rowMin: 21,
  groupGap: 8,
};

function sortColumnSensors(items) {
  return [...items].sort((a, b) => {
    const ca = COMPONENT_RANK[a.componentKey] ?? 99;
    const cb = COMPONENT_RANK[b.componentKey] ?? 99;
    if (ca !== cb) return ca - cb;
    return (a.shortLabel || "").localeCompare(b.shortLabel || "");
  });
}

function stackSensorColumn(items, side, viewport) {
  const { width, height } = viewport;
  const sorted = sortColumnSensors(items);
  if (!sorted.length) return [];

  const bottomInset = side === "left" ? COLUMN_SAFE.bottomLeft : COLUMN_SAFE.bottom;
  const usableH = height - COLUMN_SAFE.top - bottomInset;
  let groupCount = 0;
  let prevComp = null;
  sorted.forEach((p) => {
    if (prevComp && prevComp !== p.componentKey) groupCount += 1;
    prevComp = p.componentKey;
  });

  const gapBudget = groupCount * COLUMN_SAFE.groupGap;
  const step = Math.max(
    COLUMN_SAFE.rowMin,
    (usableH - gapBudget) / sorted.length,
  );

  const blockH = step * (sorted.length - 1) + gapBudget;
  let y = COLUMN_SAFE.top + (usableH - blockH) / 2;
  prevComp = null;

  const labelX = side === "left"
    ? COLUMN_SAFE.left
    : width - COLUMN_SAFE.right;

  return sorted.map((p) => {
    if (prevComp && prevComp !== p.componentKey) y += COLUMN_SAFE.groupGap;
    prevComp = p.componentKey;
    const pos = {
      sensorKey: p.sensorKey,
      labelX,
      labelY: y,
      side,
      componentKey: p.componentKey,
    };
    y += step;
    return pos;
  });
}

/**
 * Orderly two-column layout — intake path left, block/exhaust right.
 */
export function computeColumnAllSensorLayout(labelPositions, viewport = {}) {
  const { width = 1920, height = 1080 } = viewport;
  const leftItems = [];
  const rightItems = [];

  labelPositions.forEach((p) => {
    if (COLUMN_LEFT_COMPONENTS.has(p.componentKey)) {
      leftItems.push(p);
    } else {
      rightItems.push(p);
    }
  });

  return [
    ...stackSensorColumn(leftItems, "left", { width, height }),
    ...stackSensorColumn(rightItems, "right", { width, height }),
  ];
}

/**
 * De-overlap all 42 sensor labels — radial seed from screen centre, then iterative push.
 */
export function resolveAllSensorOverlaps(labelPositions, viewport = {}) {
  const {
    width = 1920,
    height = 1080,
    margin = 10,
  } = viewport;
  const cx = width / 2;
  const cy = height / 2;

  const resolved = labelPositions.map((p) => {
    const dx = p.anchorX - cx;
    const dy = p.anchorY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const radial = 32;
    return {
      ...p,
      labelOffsetX: (dx / len) * radial + 16,
      labelOffsetY: (dy / len) * radial * 0.85 - 6,
      priority: p.isActive ? 100 : Math.abs(p.deviationPct ?? 0),
    };
  });

  const halfW = ALL_SENSOR_LABEL_W / 2;
  const halfH = ALL_SENSOR_LABEL_H / 2;

  for (let iter = 0; iter < 16; iter++) {
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        const ax = a.anchorX + a.labelOffsetX;
        const ay = a.anchorY + a.labelOffsetY;
        const bx = b.anchorX + b.labelOffsetX;
        const by = b.anchorY + b.labelOffsetY;
        const overlapX = (ALL_SENSOR_LABEL_W + ALL_SENSOR_PAD) - Math.abs(bx - ax);
        const overlapY = (ALL_SENSOR_LABEL_H + ALL_SENSOR_PAD) - Math.abs(by - ay);

        if (overlapX > 0 && overlapY > 0) {
          const priA = a.priority;
          const priB = b.priority;
          const total = priA + priB + 1;
          const bShare = priA / total;
          const aShare = priB / total;
          const signX = bx >= ax ? 1 : -1;
          const signY = by >= ay ? 1 : -1;
          const pushX = overlapX * 0.55;
          const pushY = overlapY * 0.55;
          b.labelOffsetX += signX * pushX * (0.5 + bShare);
          b.labelOffsetY += signY * pushY * (0.5 + bShare);
          a.labelOffsetX -= signX * pushX * (0.5 + aShare);
          a.labelOffsetY -= signY * pushY * (0.5 + aShare);
        }
      }
    }
  }

  resolved.forEach((l) => {
    const x = l.anchorX + l.labelOffsetX;
    const y = l.anchorY + l.labelOffsetY;
    const minX = margin + halfW;
    const maxX = width - margin - halfW;
    const minY = margin + halfH;
    const maxY = height - margin - halfH - 32;
    if (x < minX) l.labelOffsetX += minX - x;
    if (x > maxX) l.labelOffsetX -= x - maxX;
    if (y < minY) l.labelOffsetY += minY - y;
    if (y > maxY) l.labelOffsetY -= y - maxY;
    l.labelX = l.anchorX + l.labelOffsetX;
    l.labelY = l.anchorY + l.labelOffsetY;
  });

  return resolved;
}

/** One-shot layout: fixed column positions while 3D anchors move. */
export function computeStableAllSensorPositions(labelPositions, viewport = {}) {
  return computeColumnAllSensorLayout(labelPositions, viewport);
}

export function resolveZoneOverlaps(labels) {
  const resolved = labels.map((p) => ({
    ...p,
    offsetX: p.offsetX ?? 0,
    offsetY: p.offsetY ?? 0,
  }));

  const PAD = 8;

  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        const dimA = zoneDim(a.id);
        const dimB = zoneDim(b.id);
        const minW = (dimA.w + dimB.w) / 2 + PAD;
        const minH = (dimA.h + dimB.h) / 2 + PAD;

        const ax = a.x + a.offsetX;
        const ay = a.y + a.offsetY;
        const bx = b.x + b.offsetX;
        const by = b.y + b.offsetY;
        const dx = bx - ax;
        const dy = by - ay;

        if (Math.abs(dx) < minW && Math.abs(dy) < minH) {
          const overlapX = minW - Math.abs(dx);
          const overlapY = minH - Math.abs(dy);
          const priA = zonePriority(a.id);
          const priB = zonePriority(b.id);
          const totalPri = priA + priB;

          const pushX = overlapX / 2;
          const pushY = overlapY / 2;
          const signX = dx >= 0 ? 1 : -1;
          const signY = dy >= 0 ? 1 : -1;

          const bWeight = priA / totalPri;
          const aWeight = priB / totalPri;

          b.offsetX += signX * pushX * (0.6 + bWeight * 0.8);
          b.offsetY += signY * pushY * (0.6 + bWeight * 0.8);
          a.offsetX -= signX * pushX * (0.6 + aWeight * 0.8);
          a.offsetY -= signY * pushY * (0.6 + aWeight * 0.8);
        }
      }
    }
  }

  // Hard separation: EGR must never cover engine block subtitle
  const block = resolved.find((z) => z.id === "zone_block");
  const egr = resolved.find((z) => z.id === "zone_egr");
  if (block && egr) {
    const blockY = block.y + block.offsetY;
    const egrY = egr.y + egr.offsetY;
    const minGap = (zoneDim("zone_block").h + zoneDim("zone_egr").h) / 2 + 12;
    if (Math.abs(egrY - blockY) < minGap) {
      const mid = (blockY + egrY) / 2;
      block.offsetY += (blockY - mid) + minGap / 2;
      egr.offsetY += (egrY - mid) - minGap / 2;
    }
    const blockX = block.x + block.offsetX;
    const egrX = egr.x + egr.offsetX;
    if (Math.abs(egrX - blockX) < 60) {
      egr.offsetX -= 72;
      block.offsetX += 8;
    }
  }

  return resolved;
}
