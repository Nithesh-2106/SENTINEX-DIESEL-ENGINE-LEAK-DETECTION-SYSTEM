import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundle = fs.readFileSync(
  path.join(__dirname, "../teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js"),
  "utf8"
);

const idx = bundle.indexOf('jO.displayName="DigitalTwin"');
const chunk = bundle.slice(idx, idx + 8000);
console.log(chunk);
