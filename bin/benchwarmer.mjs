#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const [input, ...args] = process.argv.slice(2);
if (!input || args.includes("--help")) {
  console.log("Usage: benchwarmer <spec.json> [--out chart.html]\nValidates the portable benchmark spec and writes a self-contained HTML receipt.");
  process.exit(input ? 0 : 1);
}
const output = args.includes("--out") ? args[args.indexOf("--out") + 1] : "benchwarmer-chart.html";
const spec = JSON.parse(await readFile(input, "utf8"));
if (!spec.title || !spec.metric || !Array.isArray(spec.series) || !spec.series.length || spec.series.some((row) => !row.label || !Number.isFinite(row.value))) throw new Error("Invalid spec: require title, metric, and non-empty series of {label, value}.");
const rows = [...spec.series].sort((a, b) => spec.higherIsBetter === false ? a.value - b.value : b.value - a.value);
const values = rows.map((row) => row.value), min = Math.min(...values, 0), max = Math.max(...values);
const bars = rows.map((row, index) => `<div class="row"><b>${esc(row.label)}</b><i style="width:${max === min ? 100 : Math.max(4, (row.value - min) / (max - min) * 100)}%;background:${index ? '#c7ff3d' : '#ff6d3d'}"></i><strong>${row.value}</strong></div>`).join("");
await writeFile(output, `<!doctype html><meta charset="utf-8"><title>${esc(spec.title)}</title><style>body{font:16px ui-monospace,monospace;background:#f7f2e8;color:#17231d;margin:0;padding:7vw}.card{background:#fff;padding:5vw;border:2px solid #17231d;box-shadow:10px 10px #ff6d3d;max-width:900px}h1{font:48px Georgia,serif;margin:0}.row{display:grid;grid-template-columns:140px 1fr 70px;gap:12px;align-items:center;margin:15px 0}.row i{height:32px;border:1px solid #17231d}.receipt{border-top:1px solid;margin-top:35px;padding-top:12px;font-size:13px}</style><article class="card"><h1>${esc(spec.title)}</h1><p>${esc(spec.metric)}${spec.unit ? ` · ${esc(spec.unit)}` : ""} · ${spec.higherIsBetter === false ? "lower" : "higher"} is better</p>${bars}<div class="receipt"><p><b>Interpretation:</b> ${esc(spec.interpretation || "Not provided")}</p><p><b>Source:</b> ${esc(spec.source || "Not provided")}</p><p><b>Caveat:</b> ${esc(spec.caveat || "Not provided")}</p></div></article>`);
console.log(`Wrote ${output}`);
function esc(value) { return String(value ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
