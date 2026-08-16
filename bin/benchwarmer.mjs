#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { auditMatrix, normalize, rankRow } from "../lib/benchmark.mjs";

const [input, ...args] = process.argv.slice(2);
if (!input || args.includes("--help")) {
  console.log(
    "Usage: benchwarmer <spec.json> [--out chart.html]\nValidates a benchmark series or matrix and writes a corrected, self-contained HTML receipt.",
  );
  process.exit(input ? 0 : 1);
}

const output = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : "benchwarmer-chart.html";
const spec = normalize(JSON.parse(await readFile(input, "utf8")));

function series(next) {
  const rows = [...next.series].sort((a, b) =>
    next.higherIsBetter ? b.value - a.value : a.value - b.value,
  );
  const values = rows.map((row) => row.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const bars = rows
    .map(
      (row, index) =>
        `<div class="row"><b>${esc(row.label)}</b><i class="${index ? "" : "winner"}" style="width:${max === min ? 100 : Math.max(4, ((row.value - min) / (max - min)) * 100)}%"></i><strong>${row.value}</strong></div>`,
    )
    .join("");
  return `<article class="card"><p class="tag">REHABILITATED</p><h1>${esc(next.title)}</h1><p>${esc(next.metric)}${next.unit ? ` · ${esc(next.unit)}` : ""} · ${next.higherIsBetter ? "higher" : "lower"} is better</p>${bars}${receipt(next)}</article>`;
}

function matrix(next) {
  const audit = auditMatrix(next);
  const headers = next.columns
    .map(
      (column, index) =>
        `<th>${esc(column)}<small>${audit.wins[index]} wins</small></th>`,
    )
    .join("");
  const rows = next.rows
    .map((row) => {
      const rank = rankRow(row);
      return `<tr><th>${esc(row.label)}${row.detail ? `<small>${esc(row.detail)}</small>` : ""}</th>${row.values.map((value, index) => `<td class="${rank.winners.includes(index) ? "winner" : rank.runnersUp.includes(index) ? "runner" : value === null ? "missing" : ""}"><b>${value ?? "—"}</b>${rank.winners.includes(index) ? "<small>WINNER</small>" : rank.runnersUp.includes(index) ? "<small>2ND</small>" : ""}</td>`).join("")}</tr>`;
    })
    .join("");
  const findings = audit.findings
    .map(({ text }) => `<li>${esc(text)}</li>`)
    .join("");
  return `<article class="card wide"><p class="tag">REHABILITATED</p><h1>${esc(next.title)}</h1><p>${esc(next.metric)} · winners recomputed per row</p><aside><b>Chart-crime report</b><ul>${findings}</ul></aside><div class="scroll"><table><thead><tr><th>Benchmark</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div>${receipt(next)}</article>`;
}

function receipt(next) {
  return `<div class="receipt"><p><b>Interpretation:</b> ${esc(next.interpretation || "Not provided")}</p><p><b>Source:</b> ${esc(next.source || "Not provided")}</p><p><b>Caveat:</b> ${esc(next.caveat || "Not provided")}</p></div>`;
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>\"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[character],
  );
}

const css = `*{box-sizing:border-box}body{font:16px ui-monospace,monospace;background:#f7f2e8;color:#17231d;margin:0;padding:5vw}.card{background:#fff;padding:4vw;border:2px solid #17231d;box-shadow:10px 10px #0f766e;max-width:1000px;margin:auto}.wide{max-width:1500px}h1{font:48px Georgia,serif;margin:0}.tag{font-size:11px;font-weight:900;letter-spacing:.12em;color:#0f766e}.row{display:grid;grid-template-columns:160px 1fr 70px;gap:12px;align-items:center;margin:15px 0}.row i{height:32px;border:1px solid #17231d;background:#dbeafe}.row i.winner{background:#0f766e}.receipt{border-top:1px solid;margin-top:35px;padding-top:12px;font-size:13px}aside{background:#fff8df;border:1px solid;padding:14px;margin:20px 0;font-size:12px}.scroll{overflow:auto}table{width:100%;min-width:900px;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #cad0cc;padding:12px;text-align:center}thead th{background:#17231d;color:#fff}thead th:first-child,tbody th{width:240px;text-align:left}th small,td small{display:block;margin-top:4px}td.winner{background:#0f766e;color:#fff;box-shadow:inset 0 0 0 3px #084c47}td.runner{background:#dbeafe}td.missing{background:repeating-linear-gradient(-45deg,#fff,#fff 6px,#eef0ed 6px,#eef0ed 12px)}`;

const content = spec.kind === "matrix" ? matrix(spec) : series(spec);
await writeFile(
  output,
  `<!doctype html><meta charset="utf-8"><title>${esc(spec.title)}</title><style>${css}</style>${content}`,
);
console.log(`Wrote ${output}`);
