#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { auditMatrix, normalize, rankRow } from "../lib/benchmark.mjs";

const [input, output = "benchmark-corrected.svg"] = process.argv.slice(2);
if (!input)
  throw new Error("Usage: render-matrix-svg.mjs <matrix.json> [output.svg]");
const spec = normalize(JSON.parse(await readFile(input, "utf8")));
if (spec.kind !== "matrix")
  throw new Error("SVG matrix rendering requires kind: matrix.");

const width = 1600;
const margin = 42;
const labelWidth = 400;
const tableLeft = 78;
const tableWidth = width - tableLeft * 2;
const cellWidth = (tableWidth - labelWidth) / spec.columns.length;
const headerHeight = 82;
const rowHeight = 84;
const groupHeight = 34;
const audit = auditMatrix(spec);
const bodyHeight =
  spec.rows.length * rowHeight +
  new Set(spec.rows.map((row) => row.group).filter(Boolean)).size * groupHeight;
const height = 310 + headerHeight + bodyHeight + 230;
const elements = [];
const text = (x, y, value, options = "") =>
  elements.push(
    `<text x="${x}" y="${y}" ${options}>${escapeXml(value)}</text>`,
  );
const rect = (x, y, w, h, options = "") =>
  elements.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${options}/>`,
  );

rect(0, 0, width, height, 'fill="#f7f2e8"');
rect(
  margin,
  32,
  width - margin * 2,
  height - 74,
  'fill="#fff" stroke="#17231d" stroke-width="2"',
);
text(78, 78, "REHABILITATED", 'class="tag"');
text(78, 130, spec.title, 'class="title"');
text(
  78,
  164,
  `${spec.metric}${spec.unit ? ` · ${spec.unit}` : ""} · winners recomputed per row`,
  'class="meta"',
);
rect(
  78,
  190,
  width - 156,
  88,
  'fill="#fff8df" stroke="#17231d" stroke-width="1.5"',
);
text(98, 218, "CHART-CRIME REPORT", 'class="audit-title"');
audit.findings
  .slice(0, 2)
  .forEach((finding, index) =>
    text(98, 244 + index * 22, `• ${finding.text}`, 'class="audit"'),
  );

let y = 300;
rect(78, y, labelWidth, headerHeight, 'fill="#17231d"');
text(
  98,
  y + 47,
  "Benchmark",
  'class="column-label left" style="fill:#ffffff"',
);
spec.columns.forEach((column, index) => {
  const x = 78 + labelWidth + index * cellWidth;
  rect(x, y, cellWidth, headerHeight, 'fill="#17231d" stroke="#5e6b64"');
  text(
    x + cellWidth / 2,
    y + 35,
    column,
    'class="column-label" style="fill:#ffffff" text-anchor="middle"',
  );
  text(
    x + cellWidth / 2,
    y + 59,
    `${audit.wins[index]} win${audit.wins[index] === 1 ? "" : "s"}`,
    'class="column-sub" style="fill:#b8c6be" text-anchor="middle"',
  );
});
y += headerHeight;

let previousGroup = null;
for (const row of spec.rows) {
  if (row.group && row.group !== previousGroup) {
    rect(78, y, width - 156, groupHeight, 'fill="#d7ded9" stroke="#aab4ae"');
    text(98, y + 23, row.group.toUpperCase(), 'class="group"');
    y += groupHeight;
    previousGroup = row.group;
  }
  rect(78, y, labelWidth, rowHeight, 'fill="#f4f5f2" stroke="#cad0cc"');
  text(98, y + 31, row.label, 'class="row-label"');
  if (row.detail) text(98, y + 53, row.detail, 'class="detail"');
  text(
    98,
    y + 72,
    `${row.higherIsBetter ? "↑ HIGHER" : "↓ LOWER"} IS BETTER`,
    'class="direction"',
  );
  const rank = rankRow(row);
  row.values.forEach((value, index) => {
    const x = 78 + labelWidth + index * cellWidth;
    const winner = rank.winners.includes(index);
    const runner = rank.runnersUp.includes(index);
    const fill = winner
      ? "#0f766e"
      : runner
        ? "#dbeafe"
        : value === null
          ? "url(#missing)"
          : "#fff";
    rect(
      x,
      y,
      cellWidth,
      rowHeight,
      `fill="${fill}" stroke="${winner ? "#084c47" : "#cad0cc"}" stroke-width="${winner ? 3 : 1}"`,
    );
    text(
      x + cellWidth / 2,
      y + 39,
      value ?? "—",
      `class="value${winner ? " winner" : runner ? " runner" : ""}" text-anchor="middle"`,
    );
    if (winner || runner || value === null)
      text(
        x + cellWidth / 2,
        y + 63,
        winner ? "WINNER" : runner ? "2ND" : "NO DATA",
        `class="rank${winner ? " winner" : ""}" text-anchor="middle"`,
      );
  });
  y += rowHeight;
}

const receiptY = y + 30;
elements.push(
  `<line x1="78" y1="${receiptY}" x2="${width - 78}" y2="${receiptY}" stroke="#17231d"/>`,
);
text(
  78,
  receiptY + 34,
  `Interpretation: ${spec.interpretation || "Not provided"}`,
  'class="receipt"',
);
text(
  78,
  receiptY + 64,
  `Source: ${spec.source || "Not provided"}`,
  'class="receipt"',
);
text(
  78,
  receiptY + 94,
  `Caveat: ${spec.caveat || "Not provided"}`,
  'class="receipt"',
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><pattern id="missing" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#fff"/><rect width="5" height="12" fill="#eef0ed"/></pattern></defs>
<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#17231d}.tag{font-size:14px;font-weight:900;letter-spacing:2px;fill:#0f766e}.title{font-family:Georgia,serif;font-size:42px;font-weight:700}.meta{font-size:16px;fill:#647168}.audit-title{font-size:13px;font-weight:900;letter-spacing:1px}.audit{font-size:13px}.column-label{font-size:14px;font-weight:800}.column-sub{font-size:11px}.left{text-anchor:start}.group{font-size:12px;font-weight:900;letter-spacing:1px}.row-label{font-size:15px;font-weight:800}.detail{font-size:12px;fill:#5f6a63}.direction{font-size:9px;font-weight:900;fill:#0f766e}.value{font-size:20px}.value.winner{font-weight:900;fill:#fff}.value.runner{font-weight:800}.rank{font-size:9px;font-weight:900;letter-spacing:1px}.rank.winner{fill:#fff}.receipt{font-size:12px}</style>${elements.join("")}</svg>`;
await writeFile(output, svg);
console.log(`Wrote ${output}`);

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>\"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[character],
  );
}
