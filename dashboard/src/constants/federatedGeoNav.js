/** Country centroids & zoom altitudes for globe navigation (lower = closer). */
export const COUNTRY_REGIONS = {
  India: { lat: 22.5, lng: 79.0, altitude: 0.55, code: "IN" },
  "United States": { lat: 39.5, lng: -98.0, altitude: 0.75, code: "US" },
  "United Kingdom": { lat: 53.5, lng: -1.5, altitude: 0.65, code: "GB" },
  China: { lat: 35.0, lng: 105.0, altitude: 0.65, code: "CN" },
  Brazil: { lat: -14.5, lng: -52.0, altitude: 0.7, code: "BR" },
  Japan: { lat: 36.2, lng: 138.2, altitude: 0.65, code: "JP" },
  Spain: { lat: 40.0, lng: -3.5, altitude: 0.65, code: "ES" },
  Australia: { lat: -25.0, lng: 134.0, altitude: 0.75, code: "AU" },
};

export const GLOBE_TEXTURES = {
  globe: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
  bump: "https://unpkg.com/three-globe/example/img/earth-topology.png",
  background: "https://unpkg.com/three-globe/example/img/night-sky.png",
  countries:
    "https://unpkg.com/three-globe/example/datasets/ne_110m_admin_0_countries.geojson",
  indiaStates:
    "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
};

export const GLOBAL_VIEW = { lat: 20, lng: 20, altitude: 2.2 };
