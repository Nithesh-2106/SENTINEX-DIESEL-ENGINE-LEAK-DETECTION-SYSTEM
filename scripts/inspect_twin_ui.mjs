import fs from "fs";
const s = fs.readFileSync(
  "teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js",
  "utf8"
);
const start = s.indexOf("const jO=q.forwardRef");
const end = s.indexOf('jO.displayName="DigitalTwin"') + 50;
const block = s.slice(start, end);
console.log("length", block.length);
// search within block
const terms = [
  "showLbl", "showLabel", "labels", "Labels", "LABEL", "FULL", "fullscreen",
  "nav", "Nav", "Arrow", "arrow", "zoom", "Zoom", "screen", "project",
  "tooltip", "hover", "pad", "keydown", "Key",
];
for (const t of terms) {
  let idx = 0;
  const hits = [];
  while ((idx = block.indexOf(t, idx)) >= 0 && hits.length < 5) {
    hits.push(block.slice(Math.max(0, idx - 40), idx + 80));
    idx += t.length;
  }
  if (hits.length) {
    console.log("\n===", t, "===");
    hits.forEach((h) => console.log(h));
  }
}

// Full ME array
const meStart = s.indexOf("],ME=[") + 5;
const meEnd = s.indexOf("],f$=", meStart);
console.log("\n=== FULL ME ===");
console.log(s.slice(meStart, meEnd + 1));
