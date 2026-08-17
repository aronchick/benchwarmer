import assert from "node:assert/strict";
import test from "node:test";
import worker, { browserSafeHeaders, extractTable, generatedJson, generatedJsonDiagnostic } from "../worker.js";

const imageRequest = () =>
  new Request("https://benchwarm.ing/api/extract-table", {
    method: "POST",
    headers: { "content-type": "image/png", "CF-Connecting-IP": "203.0.113.1" },
    body: new Uint8Array([137, 80, 78, 71]),
  });
const env = (governor) => ({
  GEMINI_API_KEY: "test-key",
  EXTRACTION_RATE_LIMIT_SALT: "test-salt",
  EXTRACTION_GOVERNOR: { idFromName: () => "global", get: () => governor },
});

test("removes an upstream CSP that blocks the app's own assets", async () => {
  const upstream = new Response("<link rel=stylesheet href=styles.css>", {
    headers: {
      "content-security-policy": "default-src 'none'",
      "content-type": "text/html; charset=utf-8",
    },
  });
  const env = { ASSETS: { fetch: async () => upstream } };

  const response = await worker.fetch(new Request("https://benchwarm.ing"), env);

  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "geolocation=(), microphone=(), payment=(), usb=()",
  );
});

test("preserves ordinary upstream headers", () => {
  const headers = browserSafeHeaders(
    new Headers({ etag: '"abc"', "cache-control": "public, max-age=300" }),
  );

  assert.equal(headers.get("etag"), '"abc"');
  assert.equal(headers.get("cache-control"), "public, max-age=300");
});

test("returns Gemini structured table output", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "matrix", columns: ["A", "B"], rows: [{ label: "Quality", values: [72, 81] }] }) }] } }] });
  const response = await extractTable(imageRequest(), env({ fetch: async () => Response.json({ ok: true }) }));
  assert.deepEqual(await response.json(), { kind: "matrix", columns: ["A", "B"], rows: [{ label: "Quality", values: [72, 81] }] });
});

test("reads JSON from a non-thought Gemini content part", () => {
  const table = { kind: "matrix", columns: ["A", "B"], rows: [{ label: "Quality", values: [72, 81] }] };
  assert.deepEqual(
    generatedJson({ candidates: [{ content: { parts: [{ thought: true, text: "I will inspect the table." }, { text: `\`\`\`json\n${JSON.stringify(table)}\n\`\`\`` }] } }] }),
    table,
  );
});

test("does not mistake a Gemini thought or malformed content for a table", () => {
  assert.equal(generatedJson({ candidates: [{ content: { parts: [{ thought: true, text: "{not JSON}" }, { text: "{not JSON}" }] } }] }), null);
});

test("reports only safe Gemini response metadata when JSON parsing fails", () => {
  assert.deepEqual(
    generatedJsonDiagnostic({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ thought: true, text: "private reasoning" }, {}] } }] }),
    { candidateCount: 1, finishReasons: ["MAX_TOKENS"], parts: [{ thought: true, hasText: true, textLength: 17 }, { thought: false, hasText: false, textLength: 0 }] },
  );
});

test("reports an upstream Gemini status without exposing credentials", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("invalid key", { status: 401 });
  const response = await extractTable(imageRequest(), env({ fetch: async () => Response.json({ ok: true }) }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Gemini could not extract this table. Try again later or edit locally.", code: "gemini_upstream", upstreamStatus: 401 });
});
