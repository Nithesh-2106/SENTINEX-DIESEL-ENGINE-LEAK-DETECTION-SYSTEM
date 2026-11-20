/** Working GeoJSON — deldersveld topojson URL 404s as of 2026. */
export const INDIA_GEOJSON_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";

/** @deprecated use INDIA_GEOJSON_URL */
export const INDIA_TOPOJSON_URL = INDIA_GEOJSON_URL;

export const CAT_STATES = {
  "Tamil Nadu": {
    colour: "#0DB8F0",
    facilities: ["hosur_cell", "chennai_proto"],
  },
  Karnataka: {
    colour: "#6366F1",
    facilities: ["bengaluru_cell"],
  },
  Maharashtra: {
    colour: "#A855F7",
    facilities: ["pune_cell"],
  },
};

/** FL training clients — 4 India test cells (single Hosur site). */
export const FL_CLIENT_IDS = [
  "hosur_cell",
  "pune_cell",
  "bengaluru_cell",
  "chennai_proto",
];

export const INDIA_MAP_PINS = [
  {
    id: "hosur_cell",
    name: "Hosur Test Cell",
    organisation: "Caterpillar India Pvt Ltd",
    type: "test_cell",
    city: "Hosur",
    state: "Tamil Nadu",
    lat: 12.7335,
    lng: 77.8335,
    labelOffset: { x: 0, y: -20 },
    colour: "#0DB8F0",
    colourRGB: "13, 184, 240",
    description: "C13 Primary & Reference Production Test Cell",
    environment: "High humidity — monsoon season effects",
    altitude: "919m ASL",
    flRole: "CLIENT_A",
    flWeight: 49.5,
    trainRows: 22680,
    isFlClient: true,
  },
  {
    id: "bengaluru_cell",
    name: "Bengaluru Test Cell",
    organisation: "Caterpillar India Pvt Ltd",
    type: "test_cell",
    city: "Bengaluru",
    state: "Karnataka",
    lat: 12.9716,
    lng: 77.5946,
    labelOffset: { x: -52, y: -10 },
    colour: "#6366F1",
    colourRGB: "99, 102, 241",
    description: "C13 Integration & Validation Test Cell",
    environment: "Urban corridor — mixed humidity profile",
    altitude: "920m ASL",
    flRole: "CLIENT_C",
    flWeight: 18.5,
    trainRows: 8400,
    isFlClient: true,
  },
  {
    id: "chennai_proto",
    name: "Chennai Test Cell",
    organisation: "Caterpillar India Pvt Ltd",
    type: "test_cell",
    city: "Chennai",
    state: "Tamil Nadu",
    lat: 13.0827,
    lng: 80.2707,
    labelOffset: { x: 48, y: 6 },
    colour: "#14B8A6",
    colourRGB: "20, 184, 166",
    description: "SENTINEX coastal validation test cell",
    environment: "Coastal humidity — prototype validation",
    altitude: "12m ASL",
    flRole: "CLIENT_D",
    flWeight: 14.0,
    trainRows: 6720,
    isFlClient: true,
  },
  {
    id: "pune_cell",
    name: "Pune Test Cell",
    organisation: "Caterpillar India Pvt Ltd",
    type: "test_cell",
    city: "Pune",
    state: "Maharashtra",
    lat: 18.5204,
    lng: 73.8567,
    labelOffset: { x: -48, y: -6 },
    colour: "#A855F7",
    colourRGB: "168, 85, 247",
    description: "C13 High-Altitude Test Cell",
    environment: "High altitude — reduced ambient pressure",
    altitude: "1480m ASL",
    flRole: "CLIENT_B",
    flWeight: 18.0,
    trainRows: 7560,
    isFlClient: true,
  },
  {
    id: "fedavg_server",
    name: "FedAvg Cloud Server",
    organisation: "SENTINEX Cloud Infrastructure",
    type: "cloud_server",
    city: "AWS ap-south-1",
    state: "Virtual Cloud",
    lat: 21.8,
    lng: 79.2,
    labelOffset: { x: 0, y: -16 },
    colour: "#F0A500",
    colourRGB: "240, 165, 0",
    description: "Secure Weight Aggregation — no raw data stored",
    environment: "Virtual region anchor (not a physical plant)",
    altitude: "Cloud",
    flRole: "FEDAVG_SERVER",
    flWeight: null,
    trainRows: null,
    isVirtualCloud: true,
  },
];

export const WORLD_CAT_FACILITIES = [
  { id: "w1", name: "Mossville, IL", lat: 40.6936, lng: -89.589, country: "USA" },
  { id: "w2", name: "Peoria, IL", lat: 40.6936, lng: -89.589, country: "USA" },
  { id: "w3", name: "Seguin, TX", lat: 29.5688, lng: -97.9642, country: "USA" },
  { id: "w4", name: "Griffith, NSW", lat: -34.2885, lng: 146.0397, country: "AUS" },
  { id: "w5", name: "Larne, UK", lat: 54.8575, lng: -5.8236, country: "GBR" },
  { id: "w6", name: "Gosselies, Belgium", lat: 50.4673, lng: 4.4547, country: "BEL" },
  { id: "w7", name: "Piracicaba, Brazil", lat: -22.7253, lng: -47.6492, country: "BRA" },
  { id: "w8", name: "Suzhou, China", lat: 31.2989, lng: 120.5853, country: "CHN" },
  { id: "w9", name: "Thiruvallur, India", lat: 13.1435, lng: 79.9059, country: "IND" },
  { id: "w10", name: "Jakarta, Indonesia", lat: -6.2088, lng: 106.8456, country: "IDN" },
];

export function getFlClientPins() {
  return INDIA_MAP_PINS.filter((p) => p.isFlClient);
}

/** Country labels — spread to avoid European overlap on the globe. */
export const COUNTRY_LABELS = [
  { lat: 39.0, lng: -98.0, text: "UNITED STATES", size: 2.0 },
  { lat: 52.5, lng: -1.8, text: "UNITED KINGDOM", size: 1.55 },
  { lat: 43.5, lng: -0.5, text: "FRANCE", size: 1.5 },
  { lat: 52.0, lng: 14.5, text: "GERMANY", size: 1.5 },
  { lat: 35.0, lng: 104.0, text: "CHINA", size: 1.9 },
  { lat: 36.5, lng: 139.0, text: "JAPAN", size: 1.65 },
  { lat: -26.0, lng: 136.0, text: "AUSTRALIA", size: 1.7 },
  { lat: -12.0, lng: -48.0, text: "BRAZIL", size: 1.75 },
  { lat: 20.75, lng: 79.0, text: "INDIA", size: 2.2 },
  { lat: 58.0, lng: -100.0, text: "CANADA", size: 1.55 },
  { lat: -3.0, lng: 118.0, text: "INDONESIA", size: 1.45 },
];

/** Reference + facility cities shown when zoomed into India. */
export const INDIA_CITY_LABELS = [
  ...INDIA_MAP_PINS.filter((p) => p.type !== "cloud_server").map((p) => ({
    lat: p.lat,
    lng: p.lng,
    text: p.city.toUpperCase(),
    size: p.isFlClient ? 0.55 : 0.45,
    colour: p.colour,
    isFacility: true,
  })),
  { lat: 19.076, lng: 72.8777, text: "MUMBAI", size: 0.4, colour: "rgba(255,255,255,0.45)", isFacility: false },
  { lat: 28.6139, lng: 77.209, text: "NEW DELHI", size: 0.4, colour: "rgba(255,255,255,0.45)", isFacility: false },
  { lat: 17.385, lng: 78.4867, text: "HYDERABAD", size: 0.38, colour: "rgba(255,255,255,0.4)", isFacility: false },
  { lat: 22.5726, lng: 88.3639, text: "KOLKATA", size: 0.38, colour: "rgba(255,255,255,0.4)", isFacility: false },
];

export const FEDAVG_CLOUD = INDIA_MAP_PINS.find((p) => p.id === "fedavg_server");
