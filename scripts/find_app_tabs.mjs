import fs from "fs";
const s = fs.readFileSync(
  "teammate_engine_diagram/cat/dashboard/dist/assets/index-CG4TEFVo.js",
  "utf8"
);
const i = 1176000;
console.log(s.slice(i, i + 1800));
