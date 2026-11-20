/**
 * Extract and beautify teammate DigitalTwin source from production bundle.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundle = fs.readFileSync(
  path.join(__dirname, "../teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js"),
  "utf8"
);

const start = bundle.indexOf("const Ts=[");
const end = bundle.indexOf('jO.displayName="DigitalTwin"') + 'jO.displayName="DigitalTwin"'.length;

if (start < 0 || end < start) {
  console.error("Could not locate DigitalTwin block", { start, end });
  process.exit(1);
}

const block = bundle.slice(start, end);
const outDir = path.join(__dirname, "../teammate_engine_diagram/cat/dashboard/src_extracted");
fs.mkdirSync(outDir, { recursive: true });

// Split into logical sections
const hStart = block.indexOf("function h$(");
const jStart = block.indexOf("const jO=q.forwardRef");

fs.writeFileSync(path.join(outDir, "data_and_buildEngine.js"), block.slice(0, jStart));
fs.writeFileSync(path.join(outDir, "DigitalTwin_raw.js"), block.slice(jStart));

console.log("Extracted bytes:", block.length);
console.log("  data+buildEngine:", jStart);
console.log("  DigitalTwin:", block.length - jStart);

// Also dump App.jsx tab usage from bundle
const tabIdx = bundle.indexOf("DIGITAL TWIN");
const dashIdx = bundle.indexOf("digital-twin");
console.log("Tab markers:", { tabIdx, dashIdx });
if (tabIdx > 0) console.log(bundle.slice(tabIdx - 200, tabIdx + 400));
