import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(
  __dirname,
  "../teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js"
);
const s = fs.readFileSync(bundlePath, "utf8");
const outDir = path.join(__dirname, "../dashboard/src/digitalTwin");
fs.mkdirSync(outDir, { recursive: true });

const parseJsLiteral = (jsLiteral) =>
  Function(`"use strict"; return (${jsLiteral});`)();

const sensorStart = s.indexOf('{id:"Ambient_Temp_C"');
const sensorEnd = s.indexOf("],ME=[", sensorStart);
const sensors = "[" + s.substring(sensorStart, sensorEnd) + "]";

const edgeStart = s.indexOf("],ME=[", sensorStart) + 5;
const edgeEnd = s.indexOf("],f$=", edgeStart);
const edges = s.substring(edgeStart, edgeEnd) + "]";

const leakStart = s.indexOf("f$={", edgeStart) + 3;
const leakEnd = s.indexOf(",d$=", leakStart);
const leakLoc = s.substring(leakStart, leakEnd);

const baselineStart = s.indexOf("d$={", leakStart) + 3;
const baselineEnd = s.indexOf(",ut={", baselineStart);
const baselineDefaults = s.substring(baselineStart, baselineEnd);

const sensorData = parseJsLiteral(sensors);
const edgeData = parseJsLiteral(edges);
const leakData = parseJsLiteral(leakLoc);
const baselineData = parseJsLiteral(baselineDefaults);

const writeModule = (name, exportName, data) => {
  fs.writeFileSync(
    path.join(outDir, name),
    `/** Auto-extracted from teammate digital twin build */\nexport const ${exportName} = ${JSON.stringify(data, null, 2)};\n`
  );
};

writeModule("sensorNodes.js", "SENSOR_NODES", sensorData);
writeModule("gnnEdges.js", "GNN_EDGES", edgeData);
writeModule("leakLocations.js", "LEAK_LOCATIONS", leakData);
writeModule("c13Baselines.js", "C13_BASELINE_DEFAULTS", baselineData);

console.log("OK:", sensorData.length, "sensors,", edgeData.length, "edges");
