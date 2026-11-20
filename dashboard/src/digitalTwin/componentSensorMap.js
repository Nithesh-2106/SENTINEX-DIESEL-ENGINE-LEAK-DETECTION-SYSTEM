/**
 * Re-exports from single source of truth — do not duplicate sensor lists here.
 */
export {
  COMPONENT_SENSOR_MAP,
  AIR_PATH_SEQUENCE,
  LEAK_ORIGIN_COMPONENT,
  ZONE_TO_COMPONENT,
  SENSOR_DEFINITIONS,
  COMPONENT_META,
  getSensorDef,
  getBaseline,
  deviationColour,
  signedDeviationPct,
  GNN_CROSS_EDGES,
} from "../constants/sensorDefinitions.js";
