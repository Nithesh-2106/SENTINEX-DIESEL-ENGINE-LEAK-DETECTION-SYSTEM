/**
 * Project 3D zone anchors to canvas screen coordinates for overlay lines.
 */
import * as THREE from "three";
import { ZONE_TO_COMPONENT } from "./componentSensorMap.js";

export function projectZoneToScreen(zonePos, camera, width, height) {
  const v = new THREE.Vector3(zonePos[0], zonePos[1], zonePos[2]);
  const ndc = v.project(camera);
  if (ndc.z > 1) return null;
  return {
    x: ((ndc.x + 1) / 2) * width,
    y: ((-ndc.y + 1) / 2) * height,
  };
}

/** Compute screen anchor for each component key from live camera + zone anchors. */
export function computeComponentScreenAnchors(t, width, height) {
  if (!t?.camera || !width || !height) return {};
  const zoneAnchors = t.zoneAnchors || [];
  const anchors = {};

  for (const zone of zoneAnchors) {
    if (zone.id === "zone_scr" && t.showScrZones === false) continue;
    const compKey = ZONE_TO_COMPONENT[zone.id];
    if (!compKey || !zone.pos) continue;
    const pt = projectZoneToScreen(zone.pos, t.camera, width, height);
    if (pt) anchors[compKey] = pt;
  }
  return anchors;
}

/** Ray from panel center toward target — intersect panel rect edge. */
export function nearestPanelEdgeRay(panelRect, targetX, targetY, containerRect) {
  const left = panelRect.left - containerRect.left;
  const top = panelRect.top - containerRect.top;
  const right = left + panelRect.width;
  const bottom = top + panelRect.height;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const hw = panelRect.width / 2;
  const hh = panelRect.height / 2;

  const angle = Math.atan2(targetY - cy, targetX - cx);
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const tX = hw / (Math.abs(tx) || 1e-6);
  const tY = hh / (Math.abs(ty) || 1e-6);
  const t = Math.min(tX, tY);

  return { x: cx + tx * t, y: cy + ty * t };
}
