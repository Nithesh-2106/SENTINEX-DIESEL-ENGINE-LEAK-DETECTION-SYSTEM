import fs from "fs";
const s = fs.readFileSync(
  "teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js",
  "utf8"
);
const patterns = ["P.jsx(jO", "jO,{", "view===", "setView", "dashboardView", "tabView", "hudTab", "MONITOR", "TWIN"];
for (const p of patterns) {
  let i = 0;
  let count = 0;
  while ((i = s.indexOf(p, i)) >= 0 && count < 3) {
    console.log("\n---", p, "at", i, "---");
    console.log(s.slice(Math.max(0, i - 120), i + 280));
    i += p.length;
    count += 1;
  }
}
