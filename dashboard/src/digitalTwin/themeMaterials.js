import * as THREE from "three";
import { getTokens, hexToInt } from "../utils/themeTokens.js";
import { ENGINE_COLORS as C } from "./engineMaterials.js";

export function getLabelStyles(theme) {
  const T = getTokens(theme);
  return {
    labelBg: T.labelBg,
    labelBorder: T.labelBorder,
    labelText: T.labelText,
    labelSub: T.labelSub,
  };
}

export function updateSceneMaterials(scene, theme, threeRef = {}) {
  if (!scene) return;
  const T = getTokens(theme);

  if (threeRef.renderer) {
    threeRef.renderer.setClearColor(T.rendererClear, 1);
  }
  if (scene.background !== undefined) {
    scene.background = new THREE.Color(T.sceneBg);
  }

  scene.traverse((obj) => {
    if (obj.isMesh || obj.isLine) {
      const mat = obj.material;
      if (!mat) return;
      const role = obj.userData?.role;

      if (role === "leak-particle" || role === "leak-sphere") return;

      if (role === "wireframe" || (mat.wireframe && mat.wireframe === true)) {
        mat.color.setHex(C.wframe);
        mat.needsUpdate = true;
        return;
      }

      switch (role) {
        case "engine-body":
          // Preserve per-part build colors (block grey, intake green, exhaust orange, etc.)
          break;
        case "pipe-intake":
          if (mat.color) mat.color.setHex(T.intakePipe);
          break;
        case "pipe-exhaust":
          if (mat.color) mat.color.setHex(T.exhaustPipe);
          break;
        case "gnn-node":
          if (mat.color) {
            mat.color.setHex(
              obj.userData.shapActive ? hexToInt(T.amberHex) : hexToInt(T.cyanHex)
            );
          }
          break;
        case "gnn-edge":
          if (mat.color) mat.color.setHex(hexToInt(T.cyanHex));
          break;
        case "sensor-dot":
          break;
        case "flow-particle":
          if (mat.color) mat.color.setHex(hexToInt(T.cyanHex));
          break;
        default:
          if (mat.wireframe) {
            mat.color.setHex(C.wframe);
          }
          break;
      }
      mat.needsUpdate = true;
    }
  });
}
