import test from "node:test";
import assert from "node:assert/strict";
const { parseTable, parseOcrText, fileKind, normalize } = await import(
  "../app.js"
);
test("parses a Markdown benchmark table", () => {
  const spec = parseTable(
    "| Model | Score |\n|---|---:|\n| A | 91.2 |\n| B | 88.1 |",
  );
  assert.equal(spec.series.length, 2);
  assert.equal(spec.series[0].value, 91.2);
});
test("rejects unsourced non-series data", () =>
  assert.throws(() => normalize({ title: "x", metric: "y", series: [] })));
test("parses OCR-style label and value lines", () => {
  const spec = parseOcrText(
    "Benchmark results\nModel Alpha 91.2\nModel Beta 88.1",
  );
  assert.deepEqual(
    spec.series.map(({ label, value }) => [label, value]),
    [
      ["Model Alpha", 91.2],
      ["Model Beta", 88.1],
    ],
  );
});
test("routes image and table files", () => {
  assert.equal(fileKind({ name: "chart.PNG", type: "" }), "image");
  assert.equal(fileKind({ name: "results.csv", type: "text/csv" }), "table");
  assert.equal(fileKind({ name: "notes.txt", type: "text/plain" }), "unknown");
});
