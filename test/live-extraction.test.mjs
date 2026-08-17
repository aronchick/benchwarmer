import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";

const enabled = process.env.RUN_LIVE_INTEGRATION === "1";
const endpoint = process.env.BENCHWARMER_LIVE_URL || "https://benchwarm.ing";
const fixtureDirectory = new URL("./fixtures/gemini/", import.meta.url);
const cooldownMs = 3_100;

const fixtures = [
  {
    file: "gemini-3.6-results-july-2026.png",
    columns: ["Gemini 3.6 Flash", "Gemini 3.5 Flash", "Gemini 3.1 Pro", "GPT-5.6 Luna", "Grok 4.5", "Claude Sonnet 5"],
    rowLabels: ["Input price", "SWE-Bench Pro (Public)", "CharXiv Reasoning", "GDM-MRCR v2 (8-needle)"],
    minimumRows: 12,
  },
  {
    file: "model-benchmark-matrix.png",
    columns: ["Qwen3.8-27B", "Qwen3.6-27B", "Qwen3.7-Plus", "Muse Glimmer-30B", "Opus4.6 Max"],
    rowLabels: ["Agentic terminal coding", "Repo-level code generation", "Scientific reasoning", "Competitive coding"],
    minimumRows: 12,
  },
];

function readableBody(body) {
  return body.length > 1_000 ? `${body.slice(0, 1_000)}…` : body;
}

for (const fixture of fixtures) {
  test(`live Gemini extraction: ${basename(fixture.file)}`, { skip: !enabled, timeout: 120_000 }, async () => {
    // Production intentionally permits one request per visitor every three seconds.
    // Keep these regression calls serial and polite even when the test runner changes.
    await new Promise((resolve) => setTimeout(resolve, cooldownMs));
    const image = await readFile(join(fixtureDirectory.pathname, fixture.file));
    const response = await fetch(`${endpoint}/api/extract-table`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: image,
    });
    const body = await response.text();
    assert.equal(response.status, 200, `Expected HTTP 200 from ${endpoint}; received ${response.status}: ${readableBody(body)}`);

    let table;
    try {
      table = JSON.parse(body);
    } catch {
      assert.fail(`The endpoint returned HTTP 200 but not JSON: ${readableBody(body)}`);
    }

    assert.equal(table.kind, "matrix");
    assert.deepEqual(table.columns, fixture.columns);
    assert.ok(Array.isArray(table.rows), "Response must contain rows");
    assert.ok(table.rows.length >= fixture.minimumRows, `Expected at least ${fixture.minimumRows} rows; received ${table.rows.length}`);
    const labels = table.rows.map((row) => row.label);
    for (const label of fixture.rowLabels) assert.ok(labels.includes(label), `Missing row: ${label}`);
    for (const row of table.rows) assert.equal(row.values.length, fixture.columns.length, `Wrong value count for ${row.label}`);
  });
}
