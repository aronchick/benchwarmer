import test from "node:test";
import assert from "node:assert/strict";
const { parseTable, normalize } = await import("../app.js");
test("parses a Markdown benchmark table", () => { const spec = parseTable("| Model | Score |\n|---|---:|\n| A | 91.2 |\n| B | 88.1 |"); assert.equal(spec.series.length, 2); assert.equal(spec.series[0].value, 91.2); });
test("rejects unsourced non-series data", () => assert.throws(() => normalize({ title: "x", metric: "y", series: [] })));
