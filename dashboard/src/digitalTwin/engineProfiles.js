/**
 * Engine geometry registry — one layout profile per engine family.
 */
import { C7_LAYOUT } from "./layouts/c7Layout.js";
import { C13_LAYOUT } from "./layouts/c13Layout.js";
import { C15_LAYOUT } from "./layouts/c15Layout.js";

const LAYOUT_REGISTRY = {
  CAT_C7: C7_LAYOUT,
  CAT_C13: C13_LAYOUT,
  CAT_C15: C15_LAYOUT,
};

/** Engines with a dedicated 3D layout (not fallback). */
export const GEOMETRY_READY = {
  CAT_C7: true,
  CAT_C13: true,
  CAT_C15: true,
};

export function getEngineLayout(engineId) {
  return LAYOUT_REGISTRY[engineId] || C13_LAYOUT;
}

export function isEngineGeometryReady(engineId) {
  return GEOMETRY_READY[engineId] === true;
}

export function registerEngineLayout(engineId, layout) {
  LAYOUT_REGISTRY[engineId] = layout;
  GEOMETRY_READY[engineId] = true;
}
