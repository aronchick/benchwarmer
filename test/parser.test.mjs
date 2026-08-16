import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  auditMatrix,
  matrixFromTsv,
  normalize,
  parseTable,
  rankRow,
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
  assert.deepEqual(rankRow(spec.rows[0]).winners, [0]);
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

test("infers a simple comparison matrix from positional OCR TSV", () => {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const word = (line, wordNumber, left, top, width, text) =>
    `5\t1\t1\t1\t${line}\t${wordNumber}\t${left}\t${top}\t${width}\t20\t95\t${text}`;
  const tsv = [
    header,
    word(1, 1, 90, 10, 40, "ModelA"),
    word(1, 2, 190, 10, 40, "ModelB"),
    word(2, 1, 10, 50, 50, "Quality"),
    word(2, 2, 95, 50, 30, "72.0"),
    word(2, 3, 195, 50, 30, "81.0"),
    word(3, 1, 10, 90, 50, "Safety"),
    word(3, 2, 95, 90, 30, "90.0"),
    word(3, 3, 195, 90, 30, "88.0"),
  ].join("\n");
  const spec = matrixFromTsv(tsv);
  assert.deepEqual(spec.columns, ["ModelA", "ModelB"]);
  assert.equal(spec.rows[0].label, "Quality");
  assert.deepEqual(spec.rows[0].values, [72, 81]);
});

test("rejects empty specifications", () =>
  assert.throws(() => normalize({ title: "x", metric: "y", series: [] })));

test("routes image and table files", () => {
  assert.equal(fileKind({ name: "chart.PNG", type: "" }), "image");
  assert.equal(fileKind({ name: "results.csv", type: "text/csv" }), "table");
  assert.equal(fileKind({ name: "notes.txt", type: "text/plain" }), "unknown");
});
