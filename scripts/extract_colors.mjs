import fs from "fs";
const s = fs.readFileSync(
  "teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js",
  "utf8"
);
const start = s.indexOf("ut={");
const end = s.indexOf("};function h$", start);
const ut = Function(`return (${s.substring(start + 3, end + 1)});`)();
console.log(JSON.stringify(ut, null, 2));
