import { INDIA_GEOJSON_URL } from "../data/indiaStates.js";

let cache = null;
let inflight = null;

/** Fetch India GeoJSON once and reuse across mounts. */
export function prefetchIndiaGeo() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(INDIA_GEOJSON_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`India geo ${r.status}`);
      return r.json();
    })
    .then((geo) => {
      cache = geo;
      inflight = null;
      return geo;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function getCachedIndiaGeo() {
  return cache;
}
