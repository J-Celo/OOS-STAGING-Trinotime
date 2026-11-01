import fs from "node:fs";

const css = fs.readFileSync(new URL("../public/assets/css/c-coverage-dashboard-v1.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const checks = [
  [css.includes("RC10 — centered numeric Coverage columns"), "RC10 CSS marker present"],
  [css.includes("th:nth-child(n+3):nth-child(-n+9)"), "numeric headers 3–9 centered"],
  [css.includes("td:nth-child(n+3):nth-child(-n+9)"), "numeric cells 3–9 centered"],
  [css.includes(".tt-coverage-num{text-align:center!important}"), "numeric metric cells force centered alignment"],
  [css.includes(".tt-coverage-submitted-cell,.tt-coverage-idle-cell{justify-items:center;text-align:center}"), "submitted and idle nested content centered"],
  [css.includes("th:nth-child(n+3):nth-child(-n+11)") && css.includes("td:nth-child(n+3):nth-child(-n+11)"), "Product Match release keeps all comparable numeric columns centered through Away today"],
  [html.includes("coverage-rc23"), "RC23 Coverage assets cache-busted"]
];
let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
