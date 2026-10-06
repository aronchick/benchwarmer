import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  auditMatrix,
  normalize,
  parseTable,
  rankRow,
  toEditableTable,
} from "../lib/benchmark.mjs";
import { fileKind } from "../app.js";

test("parses a Markdown benchmark series", () => {
  const spec = parseTable(
    "| Model | Score |\n|---|---:|\n| A | 91.2 |\n| B | 88.1 |",
  );

  assert.equal(spec.kind, "series");
  assert.equal(spec.series[0].value, 91.2);
});

test("parses a multi-model CSV as a matrix", () => {
  const spec = parseTable(
    "Benchmark,Direction,Model A,Model B,Model C\nAccuracy,higher,91.2,88.1,93.4\nLatency,lower,120,95,101",
  );

  assert.equal(spec.kind, "matrix");
  assert.deepEqual(spec.columns, ["Model A", "Model B", "Model C"]);
  assert.deepEqual(rankRow(spec.rows[0]).winners, [2]);
  assert.deepEqual(rankRow(spec.rows[1]).winners, [1]);
});

test("treats missing values as unavailable rather than zero", () => {
  const spec = parseTable(
    "Benchmark,Model A,Model B\nQuality,72,--\nSafety,68,81",
  );

  assert.equal(spec.rows[0].values[1], null);
  assert.equal(spec.rows[0].missingReasons[1], "not_available");
  assert.deepEqual(rankRow(spec.rows[0]).winners, [0]);
});

test("normalizes EmbeddingGemma markers, groups, and row winners", async () => {
  const expected = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/gemini/embeddinggemma2-bench.expected.json",
        import.meta.url,
      ),
    ),
  );

  const candidate = {
    ...expected,
    rows: expected.rows.map((expectedRow) => {
      const { missingReasons, footnotes, ...row } = expectedRow;

      return {
        ...row,
        values: expectedRow.values.map((value, index) => {
          if (missingReasons[index] === "not_supported") return "*";

          if (missingReasons[index] === "not_available") return "—";

          if (footnotes[index] === "not_self_reported") return `${value}**`;

          return value;
        }),
      };
    }),
  };

  const normalized = normalize(candidate);

  assert.deepEqual(normalized, expected);
  assert.deepEqual(
    normalized.rows.map((row) => rankRow(row).winners),
    [[2], [2], [0], [0], [0], [2], [0], [0], [2]],
  );

  const audit = auditMatrix(normalized);

  assert.deepEqual(audit.wins, [5, 0, 4, 0, 0, 0]);
  assert.equal(audit.highlightMisses, 4);
  assert.equal(audit.missing, 30);
  assert.deepEqual(audit.missingReasons, {
    notSupported: 24,
    notAvailable: 6,
    unclassified: 0,
  });
  assert.deepEqual(audit.footnotes, { notSelfReported: 3 });
  assert.match(
    audit.findings.map(({ text }) => text).join(" "),
    /not supported \(\*\).*not available \(—\).*not-self-reported/s,
  );

  const editable = toEditableTable(normalized);
  assert.match(editable, /31\.6\*\*/);
  assert.match(editable, /,\*,/);
  assert.match(editable, /,—,/);
});

test("detects the supplied chart's misleading column emphasis", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../examples/chart-crime.json", import.meta.url)),
  );

  const audit = auditMatrix(fixture);
  assert.equal(audit.highlightMisses, 4);
  assert.deepEqual(audit.wins, [9, 0, 0, 0, 4]);
  assert.match(
    audit.findings.map(({ text }) => text).join(" "),
    /full-column highlight/,
  );
});


test("rejects empty specifications", () =>
  assert.throws(() => normalize({ title: "x", metric: "y", series: [] })));

test("routes image and table files", () => {
  assert.equal(fileKind({ name: "chart.PNG", type: "" }), "image");
  assert.equal(fileKind({ name: "results.csv", type: "text/csv" }), "table");
  assert.equal(fileKind({ name: "notes.txt", type: "text/plain" }), "unknown");
});
