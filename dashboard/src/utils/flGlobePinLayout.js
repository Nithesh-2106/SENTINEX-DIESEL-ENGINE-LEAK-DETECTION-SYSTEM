import { CATERPILLAR_GLOBAL_NETWORK } from "../constants/federatedFacilities.js";
import { INDIA_MAP_PINS } from "../data/indiaStates.js";

/** All mappable sites for the cached globe overlay. */
export function getGlobeMapPins() {
  const india = INDIA_MAP_PINS.filter((p) => p.type !== "cloud_server").map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    state: p.state,
    country: "India",
    lat: p.lat,
    lng: p.lng,
    colour: p.colour,
    isFlClient: Boolean(p.isFlClient),
    cellType: p.type === "test_cell" ? "C13 Test Cell" : p.type,
    flRole: p.flRole,
    description: p.description,
    environment: p.environment,
    altitude: p.altitude,
    trainRows: p.trainRows,
    organisation: p.organisation,
  }));

  const global = CATERPILLAR_GLOBAL_NETWORK.filter(
    (f) => f.country !== "India" && !f.isCloud,
  ).map((f) => ({
    id: f.id,
    name: f.name,
    city: f.city,
    state: f.state,
    country: f.country,
    lat: f.coordinates.lat,
    lng: f.coordinates.lng,
    colour: f.colour || "#6B8CAE",
    isFlClient: Boolean(f.isFlClient),
    cellType: f.cellType,
  }));

  return [...india, ...global];
}

/** Equirectangular pin position — map is 2× hemisphere width (2:1). */
export function equirectPinPercent(lat, lng) {
  const x = ((lng + 180) / 360) * 200;
  const y = ((90 - lat) / 180) * 100;
  return { x, y };
}

/** Track translateX (%) to center a longitude in the circular viewport. */
export function lngToTrackOffsetPercent(lng) {
  const pinX = (lng + 180) / 360;
  return -(pinX * 2 - 0.5) * 50;
}

export const INDIA_GLOBE_LNG = 79.0;

export function splitFacilityCatalog() {
  const federated = CATERPILLAR_GLOBAL_NETWORK.filter((f) => f.isFlClient);
  const nonFederated = CATERPILLAR_GLOBAL_NETWORK.filter(
    (f) => !f.isFlClient && !f.isCloud,
  );
  return { federated, nonFederated };
}
