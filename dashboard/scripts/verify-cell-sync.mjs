/**
 * Pre-deploy verification for head ↔ tester cell sync logic.
 * Run: npm run verify:sync  (from dashboard/)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

globalThis.localStorage = {
  _data: {},
  getItem(key) {
    return this._data[key] ?? null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = { dispatchEvent: () => {} };

const toUrl = (rel) => pathToFileURL(path.join(srcRoot, rel)).href;

const {
  decayStaleSnapshot,
  isSnapshotOnline,
  isSnapshotUsable,
  isMirrorLive,
  pickMergedSnapshot,
  mergeSnapshots,
  PRESENCE_STALE_MS,
  SNAPSHOT_LIVE_MS,
} = await import(toUrl("utils/cellSyncCore.js"));

const now = Date.now();

function assert(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`${name} FAILED${detail ? `: ${detail}` : ""}`);
  }
  return name;
}

function snap(overrides = {}) {
  return {
    role: "bay-1",
    isStreaming: false,
    offline: false,
    readingCount: 0,
    updatedAt: now,
    ...overrides,
  };
}

const tests = [];

try {
  tests.push(
    assert(
      "stale streaming leak session → offline",
      decayStaleSnapshot(
        snap({
          isStreaming: true,
          updatedAt: now - PRESENCE_STALE_MS - 1000,
          latestPrediction: { Leak_Present: 1 },
          readingCount: 89,
        }),
      ).offline === true,
    ),
  );

  tests.push(
    assert(
      "fresh streaming tick → online",
      isSnapshotOnline(
        snap({
          isStreaming: true,
          updatedAt: now - 1000,
          latestPrediction: { Leak_Present: 1 },
          latestReading: {},
        }),
      ) === true,
    ),
  );

  tests.push(
    assert(
      "explicit offline flag preserved",
      decayStaleSnapshot(snap({ offline: true, isStreaming: true, updatedAt: now })).offline === true,
    ),
  );

  tests.push(
    assert(
      "stale streaming without recent tick → not mirror live",
      isMirrorLive(
        snap({
          isStreaming: true,
          updatedAt: now - SNAPSHOT_LIVE_MS - 500,
          latestPrediction: { Leak_Present: 1 },
          latestReading: {},
        }),
      ) === false,
    ),
  );

  tests.push(
    assert(
      "fresh streaming → mirror live",
      isMirrorLive(
        snap({
          isStreaming: true,
          updatedAt: now - 500,
          latestPrediction: { Leak_Present: 1 },
          latestReading: {},
        }),
      ) === true,
    ),
  );

  const staleLocal = snap({
    isStreaming: true,
    updatedAt: now - 120000,
    latestPrediction: { Leak_Present: 1 },
    readingCount: 89,
  });
  const freshRemoteOffline = snap({
    offline: true,
    isStreaming: false,
    updatedAt: now - 5000,
    readingCount: 0,
    latestPrediction: null,
  });
  const merged = pickMergedSnapshot(staleLocal, freshRemoteOffline);
  tests.push(
    assert(
      "merge prefers newer offline over stale local leak",
      merged.offline === true && merged.isStreaming === false,
      `got offline=${merged.offline} streaming=${merged.isStreaming}`,
    ),
  );

  const mergedMap = mergeSnapshots(
    { "bay-1": staleLocal },
    { "bay-2": snap({ isStreaming: true, updatedAt: now - 500, latestReading: {} }) },
    [{ id: "bay-1" }, { id: "bay-2" }],
  );
  tests.push(assert("merge map decays stale bay-1", mergedMap["bay-1"]?.offline === true));
  tests.push(assert("merge map keeps fresh bay-2", mergedMap["bay-2"]?.offline !== true));

  tests.push(
    assert(
      "paused recent heartbeat → online but not streaming mirror",
      isSnapshotOnline(snap({ isStreaming: false, updatedAt: now - 2000 })) === true
        && isMirrorLive(snap({ isStreaming: false, updatedAt: now - 2000 })) === false,
    ),
  );

  tests.push(
    assert(
      "usable requires fresh stream tick",
      isSnapshotUsable(
        snap({
          isStreaming: true,
          updatedAt: now - SNAPSHOT_LIVE_MS - 100,
          latestPrediction: { Leak_Present: 1 },
        }),
      ) === false,
    ),
  );

  console.log("Cell sync verification — all passed:");
  tests.forEach((name) => console.log(`  ✓ ${name}`));
  console.log(`\n${tests.length} checks OK — safe to deploy frontend changes.`);
  process.exit(0);
} catch (err) {
  console.error("\nCell sync verification FAILED:");
  console.error(`  ✗ ${err.message}`);
  console.error("\nFix failures before redeploying.");
  process.exit(1);
}
